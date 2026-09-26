export interface AppConfig {
  port: number;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    poolSize: number;
  };
  redisUrl: string;
  queue: {
    name: string;
    /** Redis üzerindeki BullMQ anahtar öneki; testler kendi önekini kullanır. */
    prefix: string;
  };
  worker: {
    concurrency: number;
  };
  realtime: {
    enabled: boolean;
    /** Canlı pozisyonların socket'e toplu gönderilme aralığı (ms). */
    flushIntervalMs: number;
  };
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: int(env.PORT, 3000),
    db: {
      host: env.DB_HOST ?? 'localhost',
      port: int(env.DB_PORT, 5444),
      user: env.DB_USER ?? 'geofence',
      password: env.DB_PASSWORD ?? 'geofence',
      name: env.DB_NAME ?? 'geofence',
      poolSize: int(env.DB_POOL_SIZE, 20),
    },
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6390',
    queue: {
      name: env.QUEUE_NAME ?? 'locations',
      prefix: env.QUEUE_PREFIX ?? 'geofence',
    },
    worker: {
      concurrency: int(env.WORKER_CONCURRENCY, 32),
    },
    realtime: {
      enabled: env.REALTIME_ENABLED !== 'false',
      flushIntervalMs: int(env.REALTIME_FLUSH_MS, 200),
    },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
