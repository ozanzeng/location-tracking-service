import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { closeRedis, createRedis } from '../common/redis/create-redis.js';
import { RENTAL_CACHE_TTL_SECONDS } from '../config/limits.js';
import { RENTAL_CACHE_NONE } from './fleet.constants.js';
import type { AppConfig } from '../config/configuration.types.js';
import { APP_CONFIG } from '../config/config.constants.js';

/**
 * Sürücünün kiraladığı scooter, Redis'te kısa süreli (RENTAL_CACHE_TTL_SECONDS). Sürücünün her
 * konum isteği veritabanına gitmesin: API konum kabul ederken veritabanına dokunmaz, sadece
 * kuyruğa atar (veritabanı yavaşlasa da konumlar kabul edilir). Kaynak veritabanıdır; kiralama
 * başlarken ve biterken önbellek hemen güncellenir, worker sinyal kaybında siler.
 */
@Injectable()
export class RentalCache implements OnApplicationShutdown {
  private readonly logger = new Logger(RentalCache.name);
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.prefix = `${config.queue.prefix}:rental`;
    this.redis = createRedis(config.redisUrl, {
      lazyConnect: true,
      failFast: true,
      name: 'kiralama önbelleği',
    });
  }

  /** Önbellekte yoksa `load` ile veritabanından okur ve önbelleğe yazar. */
  async get(
    riderId: string,
    load: () => Promise<string | null>,
  ): Promise<string | null> {
    const cached = await this.redis.get(this.key(riderId));
    if (cached !== null) return cached === RENTAL_CACHE_NONE ? null : cached;
    const scooterId = await load();
    await this.set(riderId, scooterId);
    return scooterId;
  }

  /**
   * Kiralama değişince. Yazılamazsa eski değer silinmeye çalışılır; o da olmazsa en fazla TTL
   * kadar yaşar.
   */
  async set(riderId: string, scooterId: string | null): Promise<void> {
    const key = this.key(riderId);
    try {
      await this.redis.set(
        key,
        scooterId ?? RENTAL_CACHE_NONE,
        'EX',
        RENTAL_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `Kiralama önbelleği yazılamadı: ${(err as Error).message}`,
      );
      await this.redis.del(key).catch(() => undefined);
    }
  }

  async clear(riderIds: string[]): Promise<void> {
    if (riderIds.length === 0) return;
    try {
      await this.redis.del(...riderIds.map((id) => this.key(id)));
    } catch (err) {
      this.logger.warn(
        `Kiralama önbelleği silinemedi: ${(err as Error).message}`,
      );
    }
  }

  private key(riderId: string): string {
    return `${this.prefix}:${riderId}`;
  }

  async onApplicationShutdown(): Promise<void> {
    await closeRedis(this.redis);
  }
}
