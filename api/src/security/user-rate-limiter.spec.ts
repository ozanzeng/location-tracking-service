import { HttpStatus } from '@nestjs/common';
import { RetryableHttpException } from '../common/http/retryable.exception.js';
import { loadConfig } from '../config/configuration.js';

// Redis yerine bellekte sayaç tutan sahte pipeline.
const counters = new Map<string, number>();
vi.mock('../common/redis/create-redis.js', () => ({
  createRedis: () => ({
    pipeline() {
      const ops: Array<() => [null, number]> = [];
      const chain = {
        incrby(key: string, by: number) {
          ops.push(() => {
            counters.set(key, (counters.get(key) ?? 0) + by);
            return [null, counters.get(key)!];
          });
          return chain;
        },
        expire() {
          ops.push(() => [null, 1]);
          return chain;
        },
        exec: async () => ops.map((op) => op()),
      };
      return chain;
    },
    quit: async () => undefined,
  }),
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
  beforeEach(() => counters.clear());

  it('sınıra kadar kabul eder, aşılınca 429 ve pencere sonuna kadar Retry-After', async () => {
    const rl = limiter(3);
    await rl.consume(new Map([['u1', 3]]));
    try {
      await rl.consume(new Map([['u1', 1]]));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RetryableHttpException);
      const e = err as RetryableHttpException;
      expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(e.retryAfterSeconds).toBeGreaterThan(0);
      expect(e.retryAfterSeconds).toBeLessThanOrEqual(60);
      expect(e.message).toMatch(/u1/);
    }
  });

  it('kullanıcılar birbirinin sınırını etkilemez', async () => {
    const rl = limiter(2);
    await rl.consume(new Map([['u1', 2]]));
    await expect(rl.consume(new Map([['u2', 2]]))).resolves.toBeUndefined();
  });

  it('toplu istekte bir kullanıcı aşarsa tamamı reddedilir', async () => {
    const rl = limiter(2);
    await expect(
      rl.consume(
        new Map([
          ['u1', 1],
          ['u2', 3],
        ]),
      ),
    ).rejects.toThrow(/u2/);
  });

  it('sınır 0 ise Redis kullanılmaz ve her şey kabul edilir', async () => {
    await expect(
      limiter(0).consume(new Map([['u1', 1_000]])),
    ).resolves.toBeUndefined();
    expect(counters.size).toBe(0);
  });
});
