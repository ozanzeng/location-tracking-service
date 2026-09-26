import { InjectQueue } from '@nestjs/bullmq';
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { RetryableHttpException } from '../common/http/retryable.exception.js';
import { locationsRejected, queueBacklog } from '../metrics/metrics.js';
import { LOCATION_QUEUE } from '../queue/location-job.js';

/**
 * Worker'lar uzun süre yetişemezse kuyruk sınırsız büyüyüp Redis belleğini doldurur.
 * Eşik aşılınca yeni konumları 503 ile reddederek sistemi korur; istemci Retry-After
 * kadar bekleyip tekrar dener. Kuyruk derinliği her istekte değil, arka planda periyodik
 * okunur; sıcak yola ek Redis çağrısı eklenmez.
 */
@Injectable()
export class QueueBackpressure implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueBackpressure.name);
  private timer: NodeJS.Timeout | null = null;
  private backlog = 0;
  /** Redis yanıt vermezken her aralıkta yeni okuma başlatılıp çağrılar birikmesin. */
  private refreshing = false;

  constructor(
    @InjectQueue(LOCATION_QUEUE) private readonly queue: Queue,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    const { maxBacklog, checkIntervalMs } = this.config.backpressure;
    if (maxBacklog <= 0) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), checkIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      this.backlog = await this.queue.getWaitingCount();
      queueBacklog.set(this.backlog);
    } catch (err) {
      // Okunamazsa son değer korunur; Redis gerçekten düştüyse kuyruğa ekleme zaten hata verir.
      this.logger.warn(`Kuyruk derinliği okunamadı: ${(err as Error).message}`);
    } finally {
      this.refreshing = false;
    }
  }

  assertCapacity(incoming: number): void {
    const { maxBacklog } = this.config.backpressure;
    if (maxBacklog > 0 && this.backlog >= maxBacklog) {
      locationsRejected.inc({ reason: 'backpressure' }, incoming);
      throw new RetryableHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Sistem yoğun, konum daha sonra tekrar gönderilmeli',
        5,
      );
    }
  }
}
