import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { createRedis } from '../common/redis/create-redis.js';
import { RetryableHttpException } from '../common/http/retryable.exception.js';
import { locationsRejected } from '../metrics/metrics.js';

const WINDOW_SECONDS = 60;

/**
 * Kullanıcı başına dakikalık sabit pencere sayacı. Sayaç Redis'te tutulduğu için
 * birden fazla API instance'ı arasında ortaktır. IP yerine kullanıcıya göre sınırlanır:
 * mobil kullanıcılar operatör NAT'ı arkasında aynı IP'yi paylaşabilir.
 * Genel (IP bazlı) koruma API gateway/load balancer katmanının işidir.
 */
@Injectable()
export class UserRateLimiter implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private readonly limit: number;
  private readonly prefix: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.limit = config.security.userRateLimitPerMinute;
    this.prefix = `${config.queue.prefix}:rl`;
    this.redis = this.limit > 0 ? createRedis(config.redisUrl) : null;
  }

  /**
   * Her kullanıcının sayacını gönderdiği konum kadar artırır; sınırı aşan varsa 429.
   * Toplu istekte bir kullanıcı sınırı aşarsa isteğin tamamı reddedilir.
   */
  async consume(countsByUser: Map<string, number>): Promise<void> {
    if (!this.redis) return;
    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / WINDOW_SECONDS);

    const pipeline = this.redis.pipeline();
    for (const [userId, count] of countsByUser) {
      const key = `${this.prefix}:${userId}:${window}`;
      pipeline.incrby(key, count).expire(key, WINDOW_SECONDS * 2);
    }
    const results = await pipeline.exec();

    const users = [...countsByUser.keys()];
    const exceeded = users.filter((_, i) => {
      const [err, value] = results?.[i * 2] ?? [];
      return !err && Number(value) > this.limit;
    });
    if (exceeded.length > 0) {
      const total = [...countsByUser.values()].reduce((a, b) => a + b, 0);
      locationsRejected.inc({ reason: 'rate_limited' }, total);
      throw new RetryableHttpException(
        HttpStatus.TOO_MANY_REQUESTS,
        `Kullanıcı başına dakikada en fazla ${this.limit} konum gönderilebilir: ${exceeded.join(', ')}`,
        WINDOW_SECONDS - (now % WINDOW_SECONDS),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
