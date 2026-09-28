import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  areaTransitions,
  jobDuration,
  jobFailures,
  jobLag,
} from '../metrics/metrics.js';
import { DeviceLog } from '../fleet/device-log.js';
import { DeviceLogResult } from '../fleet/device-log-result.enum.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { throttledErrorLogger } from '../common/redis/create-redis.js';
import { withJobSpan } from '../common/tracing/trace-context.js';
import { GeofenceService } from './geofence.service.js';
import { ProcessStatus } from './process-status.enum.js';
import { isTransientError } from './transient-error.js';
import type { DeviceLogEntry } from '../fleet/fleet.types.js';
import type {
  LocationJobData,
  LocationPoint,
  UserLocation,
} from '../queue/queue.types.js';
import type { AppConfig } from '../config/configuration.types.js';
import { APP_CONFIG } from '../config/config.constants.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Bir işteki konumları sırayla işler. İşler şeritlerden gelir (LaneWorkers): aynı kullanıcının
 * işleri tek tek, geliş sırasıyla ulaşır; bu sınıfın sıra için ayrıca bir şey yapması gerekmez.
 */
@Injectable()
export class LocationProcessor {
  private readonly logger = new Logger(LocationProcessor.name);
  private readonly transientLog = throttledErrorLogger(
    'Veritabanına ulaşılamıyor, konumlar bekletiliyor',
    10_000,
    this.logger,
  );

  constructor(
    private readonly geofence: GeofenceService,
    private readonly publisher: RealtimePublisher,
    private readonly deviceLog: DeviceLog,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  process(job: Job<LocationJobData | UserLocation>) {
    // Kuyrukta bekleme süresi: worker'ların yetişip yetişmediğinin en doğrudan göstergesi.
    jobLag.observe((Date.now() - job.timestamp) / 1000);
    const data = job.data;
    return withJobSpan(
      'location.process',
      'trace' in data ? data.trace : undefined,
      {
        'scooter.id': data.userId,
        'location.points': jobPoints(data).length,
        'messaging.system': 'bullmq',
        'messaging.destination.name': job.queueName,
      },
      () => this.processJob(job),
    );
  }

  private async processJob(job: Job<LocationJobData | UserLocation>) {
    const { userId } = job.data;
    const points = jobPoints(job.data);
    let processed = 0;
    let events = 0;
    const receivedAt = new Date(job.timestamp).toISOString();
    const requestId = 'requestId' in job.data ? job.data.requestId : undefined;
    const log: DeviceLogEntry[] = [];
    // Noktalar zamana göre sıralı; sırayla işlenmeli (bkz. LocationJobData).
    for (const point of points) {
      const stopTimer = jobDuration.startTimer();
      const result = await this.withRetry(job, () =>
        this.geofence.process({
          userId,
          lat: point.lat,
          lng: point.lng,
          recordedAt: point.recordedAt,
        }),
      );
      stopTimer({ result: result.status });
      log.push({
        receivedAt,
        processedAt: new Date().toISOString(),
        recordedAt: point.recordedAt,
        lat: point.lat,
        lng: point.lng,
        result:
          result.status === ProcessStatus.STALE
            ? DeviceLogResult.STALE
            : DeviceLogResult.PROCESSED,
        events:
          result.status === ProcessStatus.STALE
            ? []
            : result.events.map((e) => ({ type: e.eventType, area: e.area })),
        requestId,
      });
      if (result.status === ProcessStatus.STALE) continue;

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
    // İş başına tek Redis isteği; yazılamazsa konum işleme etkilenmez.
    await this.deviceLog.record(userId, log);
    return { processed, stale: points.length - processed, events };
  }

  /**
   * Nokta başarısız olursa işin içinde yeniden denenir (BullMQ'nun kendi denemesi işi şeridin
   * sonuna atardı ve aynı kullanıcının sonraki işi öne geçerdi). Nokta tek transaction'da
   * işlendiği için başarısız deneme yarım iş bırakmaz. Bekleme WORKER_RETRY_DELAY_MS'ten
   * başlar, her denemede ikiye katlanır, en fazla WORKER_RETRY_MAX_DELAY_MS olur.
   *
   * - Geçici altyapı hatası (veritabanı kapalı, yeniden başlıyor): WORKER_TRANSIENT_RETRY_MS
   *   boyunca denenir. Önceden ~0,6 sn sonra vazgeçiliyordu; 3 sn'lik bir veritabanı
   *   kesintisinde kabul edilmiş konumlar kayboluyordu.
   * - Kalıcı hata (veri ya da kod hatası): WORKER_POINT_ATTEMPTS denemeden sonra iş başarısız
   *   olur ve şerit sıradaki işle devam eder; tekrar denemek düzeltmez, şerit tıkanmasın.
   */
  private async withRetry<T>(
    job: Job<LocationJobData | UserLocation>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const {
      pointAttempts,
      retryBaseDelayMs,
      retryMaxDelayMs,
      transientRetryMs,
    } = this.config.worker;
    const started = Date.now();
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const transient = isTransientError(err);
        const giveUp = transient
          ? Date.now() - started >= transientRetryMs
          : attempt >= pointAttempts;
        if (giveUp) throw err;
        if (transient) {
          // Kesintide her şerit her denemede loglamasın: süreç başına seyreltilmiş.
          this.transientLog(err as Error);
        } else {
          this.logger.warn({
            message: 'Konum işlenemedi, tekrar denenecek',
            jobId: job.id,
            requestId: 'requestId' in job.data ? job.data.requestId : undefined,
            userId: job.data.userId,
            attempt,
            error: (err as Error).message,
          });
        }
        await sleep(
          Math.min(retryBaseDelayMs * 2 ** (attempt - 1), retryMaxDelayMs),
        );
      }
    }
  }

  onFailed(
    job: Job<LocationJobData | UserLocation> | undefined,
    error: Error,
  ): void {
    jobFailures.inc();
    this.logger.error({
      message: 'Konum işlenemedi',
      jobId: job?.id,
      queue: job?.queueName,
      requestId:
        job && 'requestId' in job.data ? job.data.requestId : undefined,
      userId: job?.data.userId,
      error: error.message,
    });
  }
}

/**
 * Önceki sürümde her iş tek konumdu: { userId, lat, lng, recordedAt }. Redis AOF ile
 * kalıcı olduğu için güncelleme sırasında kuyrukta kalan eski işler de işlenebilsin.
 */
export function jobPoints(
  data: LocationJobData | UserLocation,
): LocationPoint[] {
  if ('points' in data && Array.isArray(data.points)) return data.points;
  const { lat, lng, recordedAt } = data as UserLocation;
  return [{ lat, lng, recordedAt }];
}
