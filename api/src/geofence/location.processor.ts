import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import {
  areaTransitions,
  jobDuration,
  jobFailures,
  jobLag,
} from '../metrics/metrics.js';
import { LOCATION_QUEUE, type LocationJobData } from '../queue/location-job.js';
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
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.worker.concurrency;
    this.logger.log(
      `Worker hazır (concurrency=${this.config.worker.concurrency})`,
    );
  }

  async process(job: Job<LocationJobData>) {
    // Kuyrukta bekleme süresi: worker'ların yetişip yetişmediğinin en doğrudan göstergesi.
    jobLag.observe((Date.now() - job.timestamp) / 1000);

    let processed = 0;
    let events = 0;
    // Noktalar zamana göre sıralı; sırayla işlenmeli (bkz. LocationJobData).
    for (const point of job.data.points) {
      const stopTimer = jobDuration.startTimer();
      const result = await this.geofence.process({
        userId: job.data.userId,
        ...point,
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
    return { processed, stale: job.data.points.length - processed, events };
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
