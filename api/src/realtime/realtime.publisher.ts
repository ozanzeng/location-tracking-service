import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { closeRedis, createRedis } from '../common/redis/create-redis.js';
import type { AreaEvent } from '../geofence/geofence.types.js';
import type {
  AreasChangedMessage,
  GeofenceUpdateMessage,
} from './realtime.types.js';
import { areasChannel, updatesChannel } from './channels.js';
import type { AppConfig } from '../config/configuration.types.js';
import { APP_CONFIG } from '../config/config.constants.js';

@Injectable()
export class RealtimePublisher implements OnApplicationShutdown {
  private readonly logger = new Logger(RealtimePublisher.name);
  private readonly redis: Redis | null;
  private readonly updates: string;
  private readonly areas: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.updates = updatesChannel(config.queue.prefix);
    this.areas = areasChannel(config.queue.prefix);
    // failFast: Redis düşükken yayınlar çevrimdışı kuyrukta birikip beklemesin; canlı yayın
    // en iyi çabadır, kaçan mesajı istemciler bir sonraki konumla telafi eder.
    this.redis = config.realtime.enabled
      ? createRedis(config.redisUrl, {
          lazyConnect: true,
          failFast: true,
          name: 'canlı yayın',
        })
      : null;
  }

  /** Worker: işlenmiş konum ve giriş/çıkış olayları. */
  publish(message: GeofenceUpdateMessage): Promise<void> {
    return this.send(this.updates, message);
  }

  /** API: alan düzenlenince ya da silinince kapanan girişlerin çıkış olayları. */
  publishEvents(events: AreaEvent[]): Promise<void> {
    if (events.length === 0) return Promise.resolve();
    return this.send(this.updates, { events });
  }

  /** API: alan oluşturuldu, düzenlendi ya da silindi; istemciler alan listesini yeniler. */
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

  /**
   * HTTP sunucusu ve soketler kapandıktan sonra (Nest: onModuleDestroy → sunucu kapanışı →
   * onApplicationShutdown): kapanırken işlenmekte olan istekler bağlantıyı hâlâ kullanır.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.redis) await closeRedis(this.redis);
  }
}
