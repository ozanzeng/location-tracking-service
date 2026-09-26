import { Redis } from 'ioredis';

/**
 * Pub/sub, rate limit ve sıra sayaçları için bağımsız ioredis bağlantısı (BullMQ kendi
 * bağlantılarını yönetir).
 *
 * failFast: HTTP isteği içinde kullanılan bağlantılar için. Varsayılan ayarda
 * (maxRetriesPerRequest: null) Redis düşünce komutlar bağlantı gelene kadar bekler ve
 * istek asılı kalır; failFast'te komut bir yeniden bağlanma denemesinden ya da 2 sn'den
 * sonra hata verir.
 */
export function createRedis(
  url: string,
  options: { lazyConnect?: boolean; failFast?: boolean } = {},
) {
  const { failFast, ...rest } = options;
  return new Redis(url, {
    maxRetriesPerRequest: failFast ? 1 : null,
    ...(failFast ? { commandTimeout: 2000 } : {}),
    ...rest,
  });
}
