import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { createRedis } from '../queue/redis-connection.js';
import {
  GEOFENCE_UPDATES_CHANNEL,
  type GeofenceUpdateMessage,
} from './realtime.constants.js';

@Injectable()
export class RealtimePublisher implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimePublisher.name);
  private readonly redis: Redis | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.redis = config.realtime.enabled
      ? createRedis(config.redisUrl, { lazyConnect: true })
      : null;
  }

  async publish(message: GeofenceUpdateMessage): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.publish(GEOFENCE_UPDATES_CHANNEL, JSON.stringify(message));
    } catch (err) {
      // Canlı yayın en iyi çabadır; log kaydı zaten DB'ye yazıldı, işi başarısız sayma.
      this.logger.warn(`Yayın başarısız: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
