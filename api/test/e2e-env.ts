// e2e testleri geliştirme verisine dokunmasın: ayrı veritabanı ve kuyruk öneki.
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5444';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'geofence_test';
process.env.REDIS_URL ??= 'redis://localhost:6390';
process.env.QUEUE_PREFIX = 'geofence-test';
process.env.REALTIME_ENABLED = 'false';
// Mevcut senaryolar kimlik doğrulama ve rate limit olmadan çalışır;
// bunlar security.e2e-spec.ts içinde config ezilerek ayrıca test edilir.
delete process.env.API_KEYS;
process.env.RATE_LIMIT_USER_PER_MIN = '0';
