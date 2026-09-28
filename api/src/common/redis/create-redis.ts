import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

/**
 * Bağlantı hatalarını tek satır, seyreltilmiş uyarı olarak loglar. ioredis ve BullMQ dinleyici
 * yoksa her yeniden bağlanma denemesinde çok satırlı yığın izi basıyordu: Redis kesintisinde
 * loglar, JSON biçimi ve LOG_LEVEL dışında kalan satırlarla doluyordu. Aynı kaynaktaki
 * bağlantılar (ör. 65 kuyruk) tek dinleyiciyi paylaşır; aralık içindeki tekrarlar sayılır.
 */
export function throttledErrorLogger(
  source: string,
  intervalMs = 10_000,
  logger = new Logger('Redis'),
) {
  let lastAt = -Infinity;
  let suppressed = 0;
  return (err: Error) => {
    const now = Date.now();
    if (now - lastAt < intervalMs) {
      suppressed++;
      return;
    }
    const extra = suppressed ? ` (+${suppressed} benzer hata)` : '';
    logger.warn(`${source}: ${err.message}${extra}`);
    lastAt = now;
    suppressed = 0;
  };
}

/**
 * Pub/sub ve rate limit için bağımsız ioredis bağlantısı (kuyruklar LocationLanes'te).
 *
 * failFast: HTTP isteği içinde kullanılan bağlantılar için. Varsayılan ayarda
 * (maxRetriesPerRequest: null) Redis düşünce komutlar bağlantı gelene kadar bekler ve
 * istek asılı kalır; failFast'te komut bir yeniden bağlanma denemesinden ya da 2 sn'den
 * sonra hata verir.
 */
export function createRedis(
  url: string,
  options: { lazyConnect?: boolean; failFast?: boolean; name?: string } = {},
) {
  const { failFast, name = 'redis', ...rest } = options;
  const redis = new Redis(url, {
    maxRetriesPerRequest: failFast ? 1 : null,
    ...(failFast ? { commandTimeout: 2000 } : {}),
    ...rest,
  });
  redis.on('error', throttledErrorLogger(name));
  return redis;
}

/**
 * Bağlantıyı kapatır. Redis erişilemezken quit() bağlantının dönmesini beklerdi ve kapanış
 * asılı kalırdı: bağlıysa en fazla `timeoutMs` kadar düzgün kapanış denenir, sonra kesilir.
 */
export async function closeRedis(redis: Redis, timeoutMs = 2000) {
  if (redis.status === 'ready') {
    await Promise.race([
      redis.quit().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
    ]);
  }
  redis.disconnect();
}
