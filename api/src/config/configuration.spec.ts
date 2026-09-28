import { ConfigError, loadConfig } from './configuration.js';
import { corsOrigin } from './cors.js';

describe('loadConfig güvenlik varsayılanları', () => {
  it('production’da CORS varsayılan olarak kapalıdır', () => {
    const { corsOrigins } = loadConfig({
      NODE_ENV: 'production',
      API_KEYS: 'k1',
    }).security;
    expect(corsOrigin(corsOrigins)).toBe(false);
  });

  it('geliştirmede CORS herkese açıktır', () => {
    expect(corsOrigin(loadConfig({}).security.corsOrigins)).toBe(true);
  });

  it('virgülle ayrılmış listeleri ayrıştırır', () => {
    const { security } = loadConfig({
      API_KEYS: ' a , b,,',
      CORS_ORIGINS: 'https://ops.example.com',
    });
    expect(security.apiKeys).toEqual(['a', 'b']);
    expect(corsOrigin(security.corsOrigins)).toEqual([
      'https://ops.example.com',
    ]);
  });
});

describe('loadConfig doğrulama', () => {
  const problemsFor = (env: NodeJS.ProcessEnv): string[] => {
    try {
      loadConfig(env);
      return [];
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      return (err as ConfigError).problems;
    }
  };

  it('varsayılanlarla (yerel geliştirme) geçerlidir', () => {
    expect(problemsFor({})).toEqual([]);
  });

  it('hatalı sayıları sessizce varsayılana düşürmez', () => {
    const problems = problemsFor({
      DB_PORT: 'abc',
      QUEUE_LANES: '0',
      PORT: '3000.5',
    });
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).toMatch(/DB_PORT .*"abc"/);
    expect(problems.join('\n')).toMatch(/QUEUE_LANES/);
  });

  it("kuyruk ve worker ayarlarını env'den okur", () => {
    const config = loadConfig({
      QUEUE_KEEP_COMPLETED: '200',
      QUEUE_KEEP_FAILED: '300',
      WORKER_POINT_ATTEMPTS: '5',
      WORKER_RETRY_DELAY_MS: '50',
    });
    expect(config.queue).toMatchObject({ keepCompleted: 200, keepFailed: 300 });
    expect(config.worker).toMatchObject({
      pointAttempts: 5,
      retryBaseDelayMs: 50,
    });
    expect(problemsFor({ WORKER_POINT_ATTEMPTS: '0' })).toEqual([
      expect.stringMatching(/WORKER_POINT_ATTEMPTS/),
    ]);
  });

  it('uygulama rolü ayarlarını doğrular', () => {
    expect(
      loadConfig({ DB_APP_USER: 'geofence_app', DB_APP_PASSWORD: 'p' }).db,
    ).toMatchObject({ appUser: 'geofence_app', appPassword: 'p' });
    expect(problemsFor({ DB_APP_USER: 'geofence_app' })).toEqual([
      expect.stringMatching(/DB_APP_PASSWORD/),
    ]);
    expect(
      problemsFor({ DB_APP_USER: 'Kötü-İsim', DB_APP_PASSWORD: 'p' }),
    ).toEqual([expect.stringMatching(/DB_APP_USER/)]);
    expect(
      problemsFor({
        DB_USER: 'geofence',
        DB_APP_USER: 'geofence',
        DB_APP_PASSWORD: 'p',
      }),
    ).toEqual([expect.stringMatching(/aynı olamaz/)]);
  });

  it('bütün sorunları birlikte raporlar', () => {
    const problems = problemsFor({
      REDIS_URL: 'http://localhost:6379',
      CORS_ORIGINS: 'ops.example.com',
      REALTIME_ENABLED: 'evet',
      LOG_LEVEL: 'trace',
    });
    expect(problems).toHaveLength(4);
  });

  describe('API anahtarları (sadece API sunucusu)', () => {
    const strong = 'a'.repeat(16);
    const apiProblems = (env: NodeJS.ProcessEnv): string[] => {
      try {
        loadConfig(env, { apiServer: true });
        return [];
      } catch (err) {
        return (err as ConfigError).problems;
      }
    };

    it('production ortamında API_KEYS zorunludur', () => {
      expect(apiProblems({ NODE_ENV: 'production' })).toEqual([
        expect.stringMatching(/API_KEYS/),
      ]);
      expect(apiProblems({ NODE_ENV: 'production', API_KEYS: strong })).toEqual(
        [],
      );
    });

    it('worker, migration ve smoke betikleri production’da anahtarsız açılır', () => {
      // Migration anahtar kullanmaz; API_KEYS olmadan deploy'un ilk adımı düşmemeli.
      expect(problemsFor({ NODE_ENV: 'production' })).toEqual([]);
      expect(problemsFor({ NODE_ENV: 'production', API_KEYS: 'k' })).toEqual(
        [],
      );
    });

    it('production’da kısa/tahmin edilebilir anahtarı reddeder', () => {
      expect(
        apiProblems({ NODE_ENV: 'production', API_KEYS: 'dev-api-key' }),
      ).toEqual([expect.stringMatching(/en az 16 karakter/)]);
      expect(
        apiProblems({
          NODE_ENV: 'production',
          API_KEYS: strong,
          INGEST_API_KEYS: 'dev-driver-key',
        }),
      ).toEqual([expect.stringMatching(/en az 16 karakter/)]);
      // Geliştirmede kısa anahtar serbest.
      expect(apiProblems({ API_KEYS: 'dev-api-key' })).toEqual([]);
    });

    it('sürücü anahtarı tek başına ya da tam yetkili anahtarla aynı olamaz', () => {
      expect(apiProblems({ INGEST_API_KEYS: 'd' })).toEqual([
        expect.stringMatching(/API_KEYS de verilmeli/),
      ]);
      expect(apiProblems({ API_KEYS: 'a,b', INGEST_API_KEYS: 'b' })).toEqual([
        expect.stringMatching(/hem API_KEYS hem INGEST_API_KEYS/),
      ]);
    });
  });

  it('geçerli CORS origin listesini kabul eder', () => {
    expect(
      problemsFor({
        CORS_ORIGINS: 'https://ops.example.com, http://localhost:8080',
      }),
    ).toEqual([]);
  });

  it('veritabanı zaman aşımları varsayılan ve ayarlanabilir', () => {
    expect(loadConfig({}).db).toMatchObject({
      statementTimeoutMs: 5000,
      idleInTransactionTimeoutMs: 30_000,
    });
    expect(
      loadConfig({ DB_STATEMENT_TIMEOUT_MS: '0' }).db.statementTimeoutMs,
    ).toBe(0);
    expect(problemsFor({ DB_STATEMENT_TIMEOUT_MS: '-1' })).toHaveLength(1);
  });
});
