// e2e testleri geliştirme verisine dokunmasın: ayrı veritabanı ve kuyruk öneki.
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5444';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'geofence_test';
process.env.REDIS_URL ??= 'redis://localhost:6390';
process.env.QUEUE_PREFIX = 'geofence-test';
process.env.REALTIME_ENABLED = 'false';
