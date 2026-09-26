export interface AppConfig {
  port: number;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    poolSize: number;
    /** Tek bir sorgunun en uzun süresi (ms); 0 kapatır. Takılan sorgu bağlantıyı tutmasın. */
    statementTimeoutMs: number;
    /** Transaction içinde boşta kalınabilecek en uzun süre (ms); 0 kapatır. Kilit sızmasın. */
    idleInTransactionTimeoutMs: number;
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
  security: {
    /** Geçerli API anahtarları. Boşsa kimlik doğrulama kapalıdır (yerel geliştirme). */
    apiKeys: string[];
    /** İzin verilen CORS origin'leri; ['*'] hepsine izin verir, [] kapatır. */
    corsOrigins: string[];
    /** Kullanıcı başına dakikada kabul edilen konum sayısı; 0 kapatır. */
    userRateLimitPerMinute: number;
  };
  backpressure: {
    /** Kuyrukta bekleyen iş bu sayıyı aşınca yeni konumlar 503 ile reddedilir; 0 kapatır. */
    maxBacklog: number;
    /** Kuyruk derinliğinin yeniden okunma aralığı (ms). */
    checkIntervalMs: number;
  };
  observability: {
    /** Worker'ın /metrics için dinlediği port; 0 kapatır. */
    workerMetricsPort: number;
  };
}

/** Geçersiz ortam değişkenleri; servis açılmadan hepsi birlikte raporlanır. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Geçersiz ayarlar:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

/**
 * Ortam değişkenlerinden ayarları okur ve doğrular. Verilmeyen değer için varsayılan
 * kullanılır; verilen ama geçersiz değer (ör. DB_PORT=abc) sessizce varsayılana düşmez,
 * ConfigError fırlatılır.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];
  const production = env.NODE_ENV === 'production';

  const int = (
    name: string,
    fallback: number,
    min: number,
    max: number,
  ): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push(
        `${name} ${min}–${max} arasında bir tam sayı olmalı (verilen: "${raw}")`,
      );
      return fallback;
    }
    return value;
  };
  const list = (name: string): string[] =>
    (env[name] ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  const oneOf = (name: string, allowed: string[]) => {
    const raw = env[name];
    if (raw !== undefined && raw !== '' && !allowed.includes(raw)) {
      problems.push(
        `${name} şunlardan biri olmalı: ${allowed.join(', ')} (verilen: "${raw}")`,
      );
    }
  };

  const redisUrl = env.REDIS_URL ?? 'redis://localhost:6390';
  try {
    const { protocol } = new URL(redisUrl);
    if (protocol !== 'redis:' && protocol !== 'rediss:') throw new Error();
  } catch {
    problems.push(
      `REDIS_URL redis:// veya rediss:// adresi olmalı (verilen: "${redisUrl}")`,
    );
  }

  const apiKeys = list('API_KEYS');
  if (production && apiKeys.length === 0) {
    problems.push(
      'API_KEYS production ortamında zorunlu (virgülle ayrılmış bir veya daha fazla anahtar)',
    );
  }

  // Production'da açıkça verilmedikçe tarayıcıdan çapraz kaynak erişimi kapalı.
  const corsOrigins =
    env.CORS_ORIGINS !== undefined
      ? list('CORS_ORIGINS')
      : production
        ? []
        : ['*'];
  for (const origin of corsOrigins) {
    if (origin === '*') continue;
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
        throw new Error();
    } catch {
      problems.push(
        `CORS_ORIGINS içindeki "${origin}" geçerli bir origin değil (ör. https://ops.example.com)`,
      );
    }
  }

  oneOf('REALTIME_ENABLED', ['true', 'false']);
  oneOf('LOG_FORMAT', ['json', 'pretty']);
  oneOf('LOG_LEVEL', LOG_LEVELS);

  const config: AppConfig = {
    port: int('PORT', 3000, 1, 65_535),
    db: {
      host: env.DB_HOST ?? 'localhost',
      port: int('DB_PORT', 5444, 1, 65_535),
      user: env.DB_USER ?? 'geofence',
      password: env.DB_PASSWORD ?? 'geofence',
      name: env.DB_NAME ?? 'geofence',
      poolSize: int('DB_POOL_SIZE', 20, 1, 500),
      statementTimeoutMs: int('DB_STATEMENT_TIMEOUT_MS', 5000, 0, 600_000),
      idleInTransactionTimeoutMs: int(
        'DB_IDLE_TX_TIMEOUT_MS',
        30_000,
        0,
        3_600_000,
      ),
    },
    redisUrl,
    queue: {
      name: env.QUEUE_NAME ?? 'locations',
      prefix: env.QUEUE_PREFIX ?? 'geofence',
    },
    worker: {
      concurrency: int('WORKER_CONCURRENCY', 32, 1, 1000),
    },
    realtime: {
      enabled: env.REALTIME_ENABLED !== 'false',
      flushIntervalMs: int('REALTIME_FLUSH_MS', 200, 20, 10_000),
    },
    security: {
      apiKeys,
      corsOrigins,
      // 5 sn'de bir gönderen cihaz dakikada 12 istek atar; 5 kat pay bırakıldı. 0 kapatır.
      userRateLimitPerMinute: int('RATE_LIMIT_USER_PER_MIN', 60, 0, 100_000),
    },
    backpressure: {
      maxBacklog: int('QUEUE_MAX_BACKLOG', 200_000, 0, 100_000_000),
      checkIntervalMs: int('QUEUE_CHECK_INTERVAL_MS', 1000, 50, 60_000),
    },
    observability: {
      workerMetricsPort: int('WORKER_METRICS_PORT', 9100, 0, 65_535),
    },
  };

  if (problems.length) throw new ConfigError(problems);
  return config;
}

/** Süreç girişlerinde: ayarlar geçersizse sorunları yazıp çık (yığın izi yerine okunur mesaj). */
export function loadConfigOrExit(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  try {
    return loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export const APP_CONFIG = Symbol('APP_CONFIG');
