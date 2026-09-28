import { isProduction, LOG_LEVELS, LogFormat } from './runtime.enum.js';

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
    /**
     * Migrate betiği için: API ve worker'ın bağlandığı, sadece gereken yetkileri olan rol
     * (bkz. database/app-role.ts). Verilmezse rol yönetilmez.
     */
    appUser?: string;
    appPassword?: string;
  };
  redisUrl: string;
  queue: {
    name: string;
    /** Redis üzerindeki BullMQ anahtar öneki; testler kendi önekini kullanır. */
    prefix: string;
    /**
     * Şerit sayısı: her kullanıcı sabit bir şeride düşer, şeritte aynı anda tek iş çalışır.
     * Aynı anda işlenebilecek en fazla iş sayısıdır. API ve worker'da aynı olmalı.
     */
    lanes: number;
    /** İncelemek için Redis'te tutulan tamamlanmış iş sayısı (tüm şeritlerin toplamı). */
    keepCompleted: number;
    /** İncelemek için Redis'te tutulan başarısız iş sayısı (tüm şeritlerin toplamı). */
    keepFailed: number;
  };
  worker: {
    /**
     * İşin kilit süresi (ms). Worker kilidi bunun yarısı aralıkla yeniler; yenileyemezse
     * (çöktü, bağlantısı koptu) iş başka worker'a geçer.
     */
    lockMs: number;
    /** Kilidi düşmüş işlerin aranma aralığı (ms). */
    stalledCheckMs: number;
    /** Kalıcı hatada (veri ya da kod hatası) bir noktanın en fazla deneme sayısı. */
    pointAttempts: number;
    /** Denemeler arası ilk bekleme (ms); her denemede ikiye katlanır. */
    retryBaseDelayMs: number;
    /** Denemeler arası en uzun bekleme (ms). */
    retryMaxDelayMs: number;
    /**
     * Geçici altyapı hatasında (veritabanı kapalı, yeniden başlıyor) nokta bu süre boyunca
     * tekrar denenir (ms): kesinti geçince iş kaldığı yerden devam eder, konum kaybolmaz.
     */
    transientRetryMs: number;
    /**
     * İşin kaç kez "takıldı" (kilidi düştü) sayılabileceği; fazlasında iş başarısız olur.
     * Sürekli worker'ı çökerten bir iş şeridi sonsuza dek tıkamasın, ama makine donması gibi
     * geçici takılmalar konum kaybettirmesin.
     */
    maxStalledCount: number;
    /** Kapanışta aktif işin bitmesi için beklenen en uzun süre (ms); sonra iş başka worker'a kalır. */
    shutdownGraceMs: number;
  };
  realtime: {
    enabled: boolean;
    /** Canlı pozisyonların socket'e toplu gönderilme aralığı (ms). */
    flushIntervalMs: number;
    /** Sunucunun bağlantılara ping gönderme aralığı (ms). */
    pingIntervalMs: number;
    /** Ping'e bu süre içinde cevap vermeyen bağlantı kapatılır (ms). */
    pingTimeoutMs: number;
  };
  security: {
    /** Tam yetkili API anahtarları. Boşsa kimlik doğrulama kapalıdır (yerel geliştirme). */
    apiKeys: string[];
    /**
     * Sadece konum gönderebilen anahtarlar (sürücü uygulaması / cihaz): konum gönderir,
     * alan listesini okur, kendi kullanıcı odasına abone olur. Loglar, alan oluşturma ve
     * tüm filonun canlı yayını tam yetki ister.
     */
    ingestApiKeys: string[];
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

/** Production'da anahtarın en kısa uzunluğu: "dev-api-key" gibi tahmin edilebilir değerler geçmesin. */
export const MIN_PRODUCTION_KEY_LENGTH = 16;

export interface LoadConfigOptions {
  /**
   * API sunucusunun açılışı: anahtar kuralları sadece orada uygulanır. Worker, migration
   * ve smoke betikleri anahtar kullanmaz; production'da API_KEYS olmadan da çalışmalılar.
   */
  apiServer?: boolean;
}

/**
 * Ortam değişkenlerinden ayarları okur ve doğrular. Verilmeyen değer için varsayılan
 * kullanılır; verilen ama geçersiz değer (ör. DB_PORT=abc) sessizce varsayılana düşmez,
 * ConfigError fırlatılır.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): AppConfig {
  const problems: string[] = [];
  const production = isProduction(env);

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
  const ingestApiKeys = list('INGEST_API_KEYS');
  if (options.apiServer) {
    if (production && apiKeys.length === 0) {
      problems.push(
        'API_KEYS production ortamında zorunlu (virgülle ayrılmış bir veya daha fazla anahtar)',
      );
    }
    if (ingestApiKeys.length > 0 && apiKeys.length === 0) {
      problems.push(
        'INGEST_API_KEYS verildiyse API_KEYS de verilmeli (API_KEYS boşken doğrulama kapalıdır)',
      );
    }
    if (ingestApiKeys.some((key) => apiKeys.includes(key))) {
      problems.push(
        'Aynı anahtar hem API_KEYS hem INGEST_API_KEYS içinde olamaz',
      );
    }
    const weak = [...apiKeys, ...ingestApiKeys].filter(
      (key) => key.length < MIN_PRODUCTION_KEY_LENGTH,
    );
    if (production && weak.length > 0) {
      problems.push(
        `Production'da anahtarlar en az ${MIN_PRODUCTION_KEY_LENGTH} karakter olmalı; ${weak.length} anahtar daha kısa (ör. openssl rand -hex 24 ile üretin)`,
      );
    }
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

  if (env.DB_APP_USER) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(env.DB_APP_USER)) {
      problems.push(
        `DB_APP_USER küçük harf, rakam ve _ içermeli (verilen: "${env.DB_APP_USER}")`,
      );
    }
    if (!env.DB_APP_PASSWORD) {
      problems.push('DB_APP_USER verildiyse DB_APP_PASSWORD de verilmeli');
    }
    if (env.DB_APP_USER === (env.DB_USER ?? 'geofence')) {
      problems.push(
        "DB_APP_USER, migration'ları çalıştıran DB_USER ile aynı olamaz",
      );
    }
  }

  oneOf('REALTIME_ENABLED', ['true', 'false']);
  oneOf('LOG_FORMAT', Object.values(LogFormat));
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
      appUser: env.DB_APP_USER || undefined,
      appPassword: env.DB_APP_PASSWORD || undefined,
    },
    redisUrl,
    queue: {
      name: env.QUEUE_NAME ?? 'locations',
      prefix: env.QUEUE_PREFIX ?? 'geofence',
      // Önceki 2 worker × 32 eşzamanlı iş ile aynı paralellik.
      lanes: int('QUEUE_LANES', 64, 1, 1024),
      keepCompleted: int('QUEUE_KEEP_COMPLETED', 1000, 0, 1_000_000),
      keepFailed: int('QUEUE_KEEP_FAILED', 5000, 0, 1_000_000),
    },
    worker: {
      // Çöken worker'ın işi en geç ~30 sn içinde başka worker'a geçer:
      // kilit 20 sn içinde düşer, 5 sn'lik iki aramada bulunur.
      lockMs: int('WORKER_LOCK_MS', 20_000, 1000, 600_000),
      stalledCheckMs: int('WORKER_STALLED_CHECK_MS', 5000, 100, 600_000),
      pointAttempts: int('WORKER_POINT_ATTEMPTS', 3, 1, 20),
      retryBaseDelayMs: int('WORKER_RETRY_DELAY_MS', 200, 0, 60_000),
      retryMaxDelayMs: int('WORKER_RETRY_MAX_DELAY_MS', 5000, 0, 600_000),
      // Veritabanı yük devretmesi (failover) genelde bir dakikanın altında sürer.
      transientRetryMs: int(
        'WORKER_TRANSIENT_RETRY_MS',
        300_000,
        0,
        86_400_000,
      ),
      maxStalledCount: int('WORKER_MAX_STALLED_COUNT', 3, 1, 100),
      // docker stop 10 sn sonra süreci öldürür; ondan önce bitsin.
      shutdownGraceMs: int('WORKER_SHUTDOWN_GRACE_MS', 8000, 0, 600_000),
    },
    realtime: {
      enabled: env.REALTIME_ENABLED !== 'false',
      flushIntervalMs: int('REALTIME_FLUSH_MS', 200, 20, 10_000),
      // Yanıt vermeyen bağlantı en geç 10 + 20 = 30 sn içinde kapatılır.
      pingIntervalMs: int('REALTIME_PING_INTERVAL_MS', 10_000, 100, 300_000),
      pingTimeoutMs: int('REALTIME_PING_TIMEOUT_MS', 20_000, 100, 300_000),
    },
    security: {
      apiKeys,
      ingestApiKeys,
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
  options: LoadConfigOptions = {},
): AppConfig {
  try {
    return loadConfig(env, options);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export const APP_CONFIG = Symbol('APP_CONFIG');
