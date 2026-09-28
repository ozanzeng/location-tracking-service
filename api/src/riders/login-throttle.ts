import {
  HttpStatus,
  Inject,
  Injectable,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { closeRedis, createRedis } from '../common/redis/create-redis.js';
import { RetryableHttpException } from '../common/http/retryable.exception.js';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { LOGIN_WINDOW_SECONDS } from '../config/limits.js';

/**
 * Kaba kuvvetle şifre denemesine karşı: kullanıcı adı başına başarısız giriş sayısı, 15
 * dakikalık pencerede (LOGIN_MAX_ATTEMPTS). Sınır dolunca doğru şifre de 429 alır; pencere
 * bitince açılır. Başarılı giriş sayacı sıfırlar. IP'ye göre değil kullanıcı adına göre:
 * saldırgan IP değiştirerek aynı hesabı denemeye devam edemez. Bedeli, birinin bir hesabı
 * bilerek 15 dakika kilitleyebilmesidir; IP bazlı sınır gateway katmanının işidir.
 */
@Injectable()
export class LoginThrottle implements OnApplicationShutdown {
  private readonly redis: Redis | null;
  private readonly prefix: string;
  private readonly max: number;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.max = config.security.loginMaxAttempts;
    this.prefix = `${config.queue.prefix}:login-fail`;
    this.redis =
      this.max > 0
        ? createRedis(config.redisUrl, {
            failFast: true,
            lazyConnect: true,
            name: 'giriş denemeleri',
          })
        : null;
  }

  /** Sınır dolmuşsa 429 (Retry-After: pencerenin kalan süresi). */
  async assertAllowed(username: string): Promise<void> {
    if (!this.redis) return;
    const key = this.key(username);
    const [failures, ttl] = await Promise.all([
      this.redis.get(key),
      this.redis.ttl(key),
    ]);
    if (Number(failures ?? 0) >= this.max) {
      throw new RetryableHttpException(
        HttpStatus.TOO_MANY_REQUESTS,
        'Çok fazla başarısız giriş denemesi; biraz sonra tekrar deneyin',
        ttl > 0 ? ttl : LOGIN_WINDOW_SECONDS,
      );
    }
  }

  async recordFailure(username: string): Promise<void> {
    if (!this.redis) return;
    const key = this.key(username);
    // Pencere ilk başarısız denemede başlar; sonraki denemeler uzatmaz.
    await this.redis
      .multi()
      .incr(key)
      .expire(key, LOGIN_WINDOW_SECONDS, 'NX')
      .exec();
  }

  async reset(username: string): Promise<void> {
    if (this.redis) await this.redis.del(this.key(username));
  }

  private key(username: string): string {
    return `${this.prefix}:${username}`;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis) await closeRedis(this.redis);
  }
}
