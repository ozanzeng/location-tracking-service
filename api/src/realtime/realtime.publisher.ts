import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { createRedis } from '../common/redis/create-redis.js';
import {
  areasChannel,
  updatesChannel,
  type AreasChangedMessage,
  type GeofenceUpdateMessage,
} from './realtime.constants.js';

@Injectable()
export class RealtimePublisher implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimePublisher.name);
  private readonly redis: Redis | null;
  private readonly updates: string;
  private readonly areas: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.updates = updatesChannel(config.queue.prefix);
    this.areas = areasChannel(config.queue.prefix);
    this.redis = config.realtime.enabled
      ? createRedis(config.redisUrl, { lazyConnect: true })
      : null;
  }

  /** Worker: işlenmiş konum ve giriş/çıkış olayları. */
  publish(message: GeofenceUpdateMessage): Promise<void> {
    return this.send(this.updates, message);
  }

  /** API: yeni alan oluşturuldu; istemciler alan listesini yeniler. */
  publishAreasChanged(message: AreasChangedMessage): Promise<void> {
    return this.send(this.areas, message);
  }

  private async send(channel: string, message: object): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.publish(channel, JSON.stringify(message));
    } catch (err) {
      // Canlı yayın en iyi çabadır; log kaydı zaten DB'ye yazıldı, işi başarısız sayma.
      this.logger.warn(`Yayın başarısız: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
