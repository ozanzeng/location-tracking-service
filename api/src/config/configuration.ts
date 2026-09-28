import {
  checkAppRole,
  readApiKeys,
  readCorsOrigins,
  readInitialAdmin,
  readRedisUrl,
} from './config-checks.js';
import { ConfigError } from './config-error.js';
import type {
  AppConfig,
  ConfigContext,
  LoadConfigOptions,
} from './configuration.types.js';
import { createEnvReader } from './env-reader.js';
import { isProduction, LOG_LEVELS, LogFormat } from './runtime.enum.js';

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
  const read = createEnvReader(env, problems);
  const ctx: ConfigContext = {
    env,
    production: isProduction(env),
    problems,
    read,
  };
  const { int, oneOf } = read;
  const redisUrl = readRedisUrl(ctx);
  const apiKeys = readApiKeys(ctx, options.apiServer ?? false);
  const corsOrigins = readCorsOrigins(ctx);
  const initialAdmin = readInitialAdmin(ctx);
  checkAppRole(ctx);

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
      migrationLockTimeoutMs: int(
        'DB_MIGRATION_LOCK_TIMEOUT_MS',
        5000,
        0,
        600_000,
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
      // Cihazlar 5 sn'de bir gönderir: 30 sn = art arda 6 konum gelmedi. Sürüş bitince
      // uygulama konum göndermeyi bırakır; park edilen scooter da 30 sn sonra kapanır.
      signalLossTimeoutMs: int(
        'SIGNAL_LOSS_TIMEOUT_MS',
        30_000,
        0,
        7 * 86_400_000,
      ),
      signalLossSweepMs: int('SIGNAL_LOSS_SWEEP_MS', 5000, 100, 3_600_000),
      // Kiralama için 10 dk: tünel ya da kısa ağ kopukluğu sürücüyü scooter'dan etmesin.
      rentalIdleTimeoutMs: int(
        'RENTAL_IDLE_TIMEOUT_MS',
        600_000,
        0,
        7 * 86_400_000,
      ),
    },
    retention: {
      // Bir yıl: yıllık rapor ve itirazlar için yeterli; daha uzun saklanacaksa arşive.
      logDays: int('LOG_RETENTION_DAYS', 365, 0, 3650),
      intervalMs: int(
        'LOG_RETENTION_INTERVAL_MS',
        3_600_000,
        60_000,
        86_400_000,
      ),
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
      riderSessionTtlSeconds:
        int('RIDER_SESSION_TTL_HOURS', 24, 1, 24 * 90) * 3600,
      // Bir iş günü; panel tüm filoyu yönettiği için sürücününkinden kısa.
      adminSessionTtlSeconds:
        int('ADMIN_SESSION_TTL_HOURS', 12, 1, 24 * 7) * 3600,
      initialAdmin,
      // Kaba kuvvetle şifre denemesine karşı; kullanıcı adı başına, IP'den bağımsız.
      loginMaxAttempts: int('LOGIN_MAX_ATTEMPTS', 10, 0, 1000),
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
      // 5 sn'de bir gönderen cihaz için ~4 dakikalık geçmiş; 5.000 scooter ~40 MB.
      deviceLogSize: int('DEVICE_LOG_SIZE', 50, 0, 1000),
      deviceLogTtlSeconds: int('DEVICE_LOG_TTL_HOURS', 24, 1, 24 * 30) * 3600,
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
