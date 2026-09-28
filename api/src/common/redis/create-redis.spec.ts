import { Logger } from '@nestjs/common';
import {
  closeRedis,
  createRedis,
  throttledErrorLogger,
} from './create-redis.js';

describe('createRedis', () => {
  it('failFast: Redis erişilemezken komut beklemeden hata verir', async () => {
    // 1 numaralı port kapalı: bağlantı hemen reddedilir.
    const redis = createRedis('redis://127.0.0.1:1', {
      lazyConnect: true,
      failFast: true,
    });
    const started = Date.now();
    await expect(redis.publish('kanal', 'mesaj')).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
    redis.disconnect();
  });

  it('bağlantı hatalarını kendi dinleyicisiyle yakalar (yığın izi basılmaz)', () => {
    const redis = createRedis('redis://127.0.0.1:1', { lazyConnect: true });
    expect(redis.listenerCount('error')).toBe(1);
    redis.disconnect();
  });
});

describe('closeRedis', () => {
  it('Redis erişilemezken kapanışı bekletmez', async () => {
    const redis = createRedis('redis://127.0.0.1:1');
    const started = Date.now();
    await closeRedis(redis);
    expect(Date.now() - started).toBeLessThan(500);
    // Yeniden bağlanmayı bırakır.
    await vi.waitFor(() => expect(redis.status).toBe('end'));
  });
});

describe('throttledErrorLogger', () => {
  afterEach(() => vi.useRealTimers());

  it('aralık içindeki tekrarları tek satırda toplar', () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const onError = throttledErrorLogger('kuyruk', 10_000, {
      warn,
    } as unknown as Logger);

    for (let i = 0; i < 5; i++) onError(new Error('ECONNREFUSED'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenLastCalledWith('kuyruk: ECONNREFUSED');

    vi.advanceTimersByTime(10_000);
    onError(new Error('ECONNREFUSED'));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith(
      'kuyruk: ECONNREFUSED (+4 benzer hata)',
    );
  });
});
