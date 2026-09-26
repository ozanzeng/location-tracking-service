import { Redis } from 'ioredis';

/** Pub/sub için bağımsız ioredis bağlantısı (BullMQ kendi bağlantılarını yönetir). */
export function createRedis(
  url: string,
  options: { lazyConnect?: boolean } = {},
) {
  return new Redis(url, { maxRetriesPerRequest: null, ...options });
}
