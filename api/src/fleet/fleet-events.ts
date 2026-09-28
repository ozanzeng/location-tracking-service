import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { closeRedis, createRedis } from '../common/redis/create-redis.js';
import type { FleetChangedMessage } from './fleet.types.js';
import type { AppConfig } from '../config/configuration.types.js';
import { APP_CONFIG } from '../config/config.constants.js';

/**
 * Filo değişikliklerini Redis'e duyurur (API: ekleme, silme, kiralama; worker: sinyal kaybında
 * biten kiralama). Canlı yayın kapalıyken de çalışır: API instance'larının scooter kayıt
 * listesi (ScooterRegistry) bu duyuruyla yenilenir.
 */
@Injectable()
export class FleetEvents implements OnApplicationShutdown {
  private readonly logger = new Logger(FleetEvents.name);
  private readonly redis: Redis;
  private readonly channel: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.channel = fleetChannel(config.queue.prefix);
    this.redis = createRedis(config.redisUrl, {
      lazyConnect: true,
      failFast: true,
      name: 'filo duyuruları',
    });
  }

  /**
   * Beklenmez ve hata fırlatmaz: değişiklik veritabanına yazıldı. Duyuru kaçarsa kayıt listesi
   * periyodik yenilemeyle, istemciler bir sonraki yenilemeyle düzelir.
   */
  publish(message: FleetChangedMessage): void {
    this.redis
      .publish(this.channel, JSON.stringify(message))
      .catch((err: Error) =>
        this.logger.warn(`Filo duyurusu gönderilemedi: ${err.message}`),
      );
  }

  async onApplicationShutdown(): Promise<void> {
    await closeRedis(this.redis);
  }
}

/** Filo değişikliklerinin duyurulduğu kanal; önek ortamları ayırır. */
export const fleetChannel = (prefix: string) => `${prefix}:fleet`;
