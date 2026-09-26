import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DelayedError, type Job, type Queue } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import {
  areaTransitions,
  jobDuration,
  jobFailures,
  jobLag,
} from '../metrics/metrics.js';
import { decideOrder, ORDER_RETRY_MS } from '../queue/job-order.js';
import {
  LOCATION_QUEUE,
  type LocationJobData,
  type LocationPoint,
} from '../queue/location-job.js';
import { UserSequencer } from '../queue/user-sequencer.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { GeofenceService } from './geofence.service.js';

@Processor(LOCATION_QUEUE)
export class LocationProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(LocationProcessor.name);

  constructor(
    private readonly geofence: GeofenceService,
    private readonly publisher: RealtimePublisher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sequencer: UserSequencer,
    @InjectQueue(LOCATION_QUEUE) private readonly queue: Queue<LocationJobData>,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.worker.concurrency;
    this.logger.log(
      `Worker hazır (concurrency=${this.config.worker.concurrency})`,
    );
  }

  async process(job: Job<LocationJobData>, token?: string) {
    const { userId, seq } = job.data;
    // Aynı kullanıcının önceki işi bitmediyse bu iş kısa süre ertelenir (bkz. UserSequencer).
    if (seq !== undefined) {
      const decision = decideOrder(
        seq,
        await this.sequencer.lastCompleted(userId),
        job.data.orderWait,
        Date.now(),
      );
      if (decision.action === 'wait') {
        const { done, since } = decision.wait;
        if (job.data.orderWait?.done !== done) {
          await job.updateData({ ...job.data, orderWait: { done, since } });
        }
        await this.sequencer.markWaiting(userId, seq, job.id!);
        await job.moveToDelayed(Date.now() + ORDER_RETRY_MS, token);
        throw new DelayedError();
      }
      if (decision.outOfOrder) {
        this.logger.warn({
          message: 'Önceki iş ilerlemedi; sıra beklenmeden işleniyor',
          jobId: job.id,
          userId,
          seq,
        });
      }
    }

    // Kuyrukta bekleme süresi: worker'ların yetişip yetişmediğinin en doğrudan göstergesi.
    jobLag.observe((Date.now() - job.timestamp) / 1000);

    const points = jobPoints(job.data);
    let processed = 0;
    let events = 0;
    // Noktalar zamana göre sıralı; sırayla işlenmeli (bkz. LocationJobData).
    for (const point of points) {
      const stopTimer = jobDuration.startTimer();
      const result = await this.geofence.process({
        userId,
        lat: point.lat,
        lng: point.lng,
        recordedAt: point.recordedAt,
      });
      stopTimer({ result: result.status });
      if (result.status === 'stale') continue;

      processed++;
      events += result.events.length;
      for (const event of result.events) {
        areaTransitions.inc({ event: event.eventType });
      }
      await this.publisher.publish({
        position: result.position,
        events: result.events,
      });
    }
    if (seq !== undefined) {
      const waiting = await this.sequencer.complete(userId, seq);
      if (waiting) await this.promote(waiting);
    }
    return { processed, stale: points.length - processed, events };
  }

  /** Sırasını bekleyen ardıl işi beklemesini bitirmeden kuyruğun önüne al. */
  private async promote(jobId: string): Promise<void> {
    try {
      await (await this.queue.getJob(jobId))?.promote();
    } catch {
      // Henüz ertelenmemiş ya da çoktan işlenmiş: periyodik yeniden deneme yeter.
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<LocationJobData> | undefined, error: Error): void {
    jobFailures.inc();
    this.logger.error({
      message: 'Konum işlenemedi',
      jobId: job?.id,
      requestId: job?.data.requestId,
      userId: job?.data.userId,
      attempt: job?.attemptsMade,
      error: error.message,
    });
  }
}

/**
 * Önceki sürümde her iş tek konumdu: { userId, lat, lng, recordedAt }. Redis AOF ile
 * kalıcı olduğu için güncelleme sırasında kuyrukta kalan eski işler de işlenebilsin.
 */
type LegacyLocationJobData = { userId: string } & LocationPoint;

export function jobPoints(
  data: LocationJobData | LegacyLocationJobData,
): LocationPoint[] {
  if ('points' in data && Array.isArray(data.points)) return data.points;
  const { lat, lng, recordedAt } = data as LegacyLocationJobData;
  return [{ lat, lng, recordedAt }];
}
