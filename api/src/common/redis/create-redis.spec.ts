import { createRedis } from './create-redis.js';

describe('createRedis', () => {
  it('failFast: Redis erişilemezken komut beklemeden hata verir', async () => {
    // 1 numaralı port kapalı: bağlantı hemen reddedilir.
    const redis = createRedis('redis://127.0.0.1:1', {
      lazyConnect: true,
      failFast: true,
    });
    redis.on('error', () => undefined);
    const started = Date.now();
    await expect(redis.publish('kanal', 'mesaj')).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
    redis.disconnect();
  });
});
