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
import { RATE_LIMIT_WINDOW_SECONDS as WINDOW_SECONDS } from '../config/limits.js';
import { locationsRejected } from '../metrics/metrics.js';
import { RejectionReason } from '../metrics/rejection-reason.enum.js';

/**
 * Kontrol ve artırma tek adımda (atomik): önce bütün kullanıcıların sayacı okunur, biri
 * sınıra ulaşmışsa hiçbir sayaca dokunulmadan reddedilir. Böylece reddedilen istek kotayı
 * harcamaz; ret sürekli tekrarlansa bile pencere sonunda istemci yeniden gönderebilir.
 * KEYS: kullanıcı sayaçları, ARGV: sınır, TTL, ardından her kullanıcının konum sayısı.
 * Dönen değer: sınıra ulaşmış kullanıcıların KEYS içindeki sırası (1'den başlar).
 */
const CONSUME_SCRIPT = `
local limit = tonumber(ARGV[1])
local exceeded = {}
for i, key in ipairs(KEYS) do
  if tonumber(redis.call('GET', key) or '0') >= limit then
    table.insert(exceeded, i)
  end
end
if #exceeded > 0 then return exceeded end
for i, key in ipairs(KEYS) do
  redis.call('INCRBY', key, ARGV[i + 2])
  redis.call('EXPIRE', key, ARGV[2])
end
return exceeded
`;

type RateLimitRedis = Redis & {
  consumeRateLimit(
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<number[]>;
};

/**
 * Kullanıcı başına dakikalık sabit pencere sayacı. Sayaç Redis'te tutulduğu için
 * birden fazla API instance'ı arasında ortaktır. IP yerine kullanıcıya göre sınırlanır:
 * mobil kullanıcılar operatör NAT'ı arkasında aynı IP'yi paylaşabilir.
 * Genel (IP bazlı) koruma API gateway/load balancer katmanının işidir.
 *
 * Sayacı sınırın altındaki kullanıcının isteği, sınırı tek başına aşsa da kabul edilir:
 * uzun kopukluktan sonra gelen 100 konumluk toplu istek, dakikada 60 sınırıyla hiç
 * geçemez ve cihazın kuyruğu sonsuza dek tıkanırdı. Bir kullanıcı dakikada en fazla
 * sınır - 1 + toplu istek boyutu kadar konum gönderebilir.
 */
@Injectable()
export class UserRateLimiter implements OnModuleDestroy {
  private readonly redis: RateLimitRedis | null;
  private readonly limit: number;
  private readonly prefix: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.limit = config.security.userRateLimitPerMinute;
    this.prefix = `${config.queue.prefix}:rl`;
    this.redis = null;
    if (this.limit > 0) {
      const redis = createRedis(config.redisUrl, { failFast: true });
      redis.defineCommand('consumeRateLimit', { lua: CONSUME_SCRIPT });
      this.redis = redis as RateLimitRedis;
    }
  }

  /**
   * Her kullanıcının sayacını gönderdiği konum kadar artırır; sınıra ulaşmış biri varsa 429.
   * Toplu istekte bir kullanıcı sınırdaysa isteğin tamamı reddedilir ve hiçbir sayaç artmaz.
   */
  async consume(countsByUser: Map<string, number>): Promise<void> {
    if (!this.redis) return;
    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / WINDOW_SECONDS);

    const users = [...countsByUser.keys()];
    const exceeded = await this.redis.consumeRateLimit(
      users.length,
      ...users.map((userId) => `${this.prefix}:${userId}:${window}`),
      this.limit,
      WINDOW_SECONDS * 2,
      ...countsByUser.values(),
    );
    if (exceeded.length > 0) {
      const total = [...countsByUser.values()].reduce((a, b) => a + b, 0);
      locationsRejected.inc({ reason: RejectionReason.RATE_LIMITED }, total);
      throw new RetryableHttpException(
        HttpStatus.TOO_MANY_REQUESTS,
        `Kullanıcı başına dakikada en fazla ${this.limit} konum gönderilebilir: ${exceeded.map((i) => users[i - 1]).join(', ')}`,
        WINDOW_SECONDS - (now % WINDOW_SECONDS),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
