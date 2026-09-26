import { HttpStatus } from '@nestjs/common';
import { RetryableHttpException } from '../common/http/retryable.exception.js';
import { loadConfig } from '../config/configuration.js';

// Lua betiğinin kendisi gerçek Redis'le test/security.e2e-spec.ts içinde sınanır;
// burada sadece betiğe giden argümanlar ve sonucun HTTP hatasına çevrilmesi.
const consumeRateLimit = vi.fn();
let redisCreated = false;
vi.mock('../common/redis/create-redis.js', () => ({
  createRedis: () => {
    redisCreated = true;
    return {
      defineCommand: () => undefined,
      consumeRateLimit,
      quit: async () => undefined,
    };
  },
}));

const { UserRateLimiter } = await import('./user-rate-limiter.js');

const limiter = (limit: number) => {
  const base = loadConfig({});
  return new UserRateLimiter({
    ...base,
    security: { ...base.security, userRateLimitPerMinute: limit },
  });
};

describe('UserRateLimiter', () => {
  beforeEach(() => {
    consumeRateLimit.mockReset().mockResolvedValue([]);
    redisCreated = false;
  });

  it('her kullanıcı için sayaç anahtarı, sınır, TTL ve konum sayısını gönderir', async () => {
    await limiter(3).consume(
      new Map([
        ['u1', 2],
        ['u2', 5],
      ]),
    );
    const [numKeys, k1, k2, limit, ttl, c1, c2] =
      consumeRateLimit.mock.calls[0];
    expect(numKeys).toBe(2);
    expect(k1).toMatch(/^geofence:rl:u1:\d+$/);
    expect(k2).toMatch(/^geofence:rl:u2:\d+$/);
    expect([limit, ttl, c1, c2]).toEqual([3, 120, 2, 5]);
  });

  it('sınıra ulaşan kullanıcı varsa 429, adıyla ve pencere sonuna kadar Retry-After', async () => {
    consumeRateLimit.mockResolvedValue([2]);
    try {
      await limiter(3).consume(
        new Map([
          ['u1', 1],
          ['u2', 1],
        ]),
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RetryableHttpException);
      const e = err as RetryableHttpException;
      expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(e.retryAfterSeconds).toBeGreaterThan(0);
      expect(e.retryAfterSeconds).toBeLessThanOrEqual(60);
      expect(e.message).toMatch(/u2/);
      expect(e.message).not.toMatch(/u1/);
    }
  });

  it('sınır 0 ise Redis kullanılmaz ve her şey kabul edilir', async () => {
    await expect(
      limiter(0).consume(new Map([['u1', 1_000]])),
    ).resolves.toBeUndefined();
    expect(redisCreated).toBe(false);
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });
});
