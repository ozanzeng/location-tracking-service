import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { loadConfig } from '../src/config/configuration.js';
import { QueueBackpressure } from '../src/locations/queue-backpressure.js';
import { LocationLanes } from '../src/queue/location-lanes.js';
import {
  createTestApp,
  INSIDE,
  registerRider,
  MODA_SQUARE,
  rentScooter,
  resetState,
  waitForQueueDrain,
} from './helpers.js';

const KEY = 'test-key';
// Rate limit sayaçları Redis'te dakikalık tutulur; koşular birbirini etkilemesin.
const run = Date.now().toString(36);
/**
 * Rate limit sayaçları dakikalık sabit pencerede tutulur. Test pencere bitmek üzereyken
 * başlarsa istekleri arasında pencere değişir, sayaç sıfırlanır ve beklenen 429 gelmez.
 * Her test bir saniyeden kısa sürer; pencerede en az `minRemainingMs` kalana kadar bekler.
 */
const waitForFreshWindow = async (minRemainingMs: number) => {
  const remaining = 60_000 - (Date.now() % 60_000);
  if (remaining < minRemainingMs) {
    await new Promise((resolve) => setTimeout(resolve, remaining + 50));
  }
};
const location = (userId: string) => ({
  userId,
  ...INSIDE,
  timestamp: new Date(Date.now() - 1000).toISOString(),
});

describe('Güvenlik ve gözlemlenebilirlik (e2e)', () => {
  let app: INestApplication;
  const post = (path: string, body: object, key: string | null = KEY) => {
    const req = request(app.getHttpServer()).post(path).send(body);
    return key ? req.set('x-api-key', key) : req;
  };

  beforeAll(async () => {
    app = await createTestApp({
      config: (c) => ({
        ...c,
        security: {
          ...c.security,
          apiKeys: [KEY],
          userRateLimitPerMinute: 3,
        },
      }),
    });
    await resetState(app);
  });
  afterAll(async () => {
    await waitForQueueDrain(app);
    await app.close();
  });

  describe('API anahtarı', () => {
    it('anahtarsız veya yanlış anahtarla 401', async () => {
      await post('/locations', location(`k-${run}`), null).expect(401);
      await post('/locations', location(`k-${run}`), 'yanlis').expect(401);
      await request(app.getHttpServer()).get('/areas').expect(401);
      await request(app.getHttpServer()).get('/logs').expect(401);
    });

    it('doğru anahtarla kabul eder', async () => {
      await post('/locations', location(`k-${run}`)).expect(202);
      await request(app.getHttpServer())
        .get('/areas')
        .set('x-api-key', KEY)
        .expect(200);
    });

    it('sürücü oturumu kiraladığı scooter için konum gönderir, alanları ve filoyu okur; başka hiçbir şeye erişemez', async () => {
      const server = app.getHttpServer();
      const token = await registerRider(app, `sec-${run}`);
      await rentScooter(app, token, 'scooter-01').expect(201);
      const bearer = `Bearer ${token}`;
      await request(server)
        .post('/locations')
        .set('authorization', bearer)
        .send(location('scooter-01'))
        .expect(202);
      await request(server)
        .post('/locations/batch')
        .set('authorization', bearer)
        .send({ locations: [location('scooter-01')] })
        .expect(202);
      for (const path of ['/areas', '/scooters']) {
        await request(server)
          .get(path)
          .set('authorization', bearer)
          .expect(200);
      }

      for (const path of ['/logs', '/locations/latest']) {
        await request(server)
          .get(path)
          .set('authorization', bearer)
          .expect(403);
      }
      await request(server)
        .post('/areas')
        .set('authorization', bearer)
        .send({ name: 'x', type: 'PARKING', geometry: {} })
        .expect(403);
      await request(server)
        .post('/scooters')
        .set('authorization', bearer)
        .send({ id: 'x' })
        .expect(403);
      await request(server)
        .delete('/scooters/scooter-02')
        .set('authorization', bearer)
        .expect(403);
      const areaId = '00000000-0000-4000-8000-000000000000';
      await request(server)
        .patch(`/areas/${areaId}`)
        .set('authorization', bearer)
        .send({ name: 'x' })
        .expect(403);
      await request(server)
        .delete(`/areas/${areaId}`)
        .set('authorization', bearer)
        .expect(403);
      // Sürüş park alanında biter: scooter'ın son konumu bir park alanının içinde.
      await post('/areas', {
        name: 'Güvenlik testi parkı',
        type: 'PARKING',
        geometry: MODA_SQUARE,
      }).expect(201);
      await waitForQueueDrain(app);
      await request(server)
        .post('/rentals/current/end')
        .set('authorization', bearer)
        .expect(200);
    });

    it('sürücü uç noktaları API anahtarıyla çağrılamaz (kimin adına olduğu belli olmalı)', async () => {
      await request(app.getHttpServer())
        .post('/rentals')
        .set('x-api-key', KEY)
        .send({ scooterId: 'scooter-01' })
        .expect(401);
    });

    it('health, liveness, readiness ve metrics anahtar istemez', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
      await request(app.getHttpServer())
        .get('/health/live')
        .expect(200, { status: 'ok' });
      await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200, { status: 'ok', database: 'up', redis: 'up' });
      await request(app.getHttpServer()).get('/metrics').expect(200);
    });
  });

  describe('kullanıcı başına rate limit', () => {
    let redis: Redis;
    /** Kullanıcının bütün pencerelerdeki sayaçlarının toplamı (gerçek Redis). */
    const counter = async (user: string) => {
      const keys = await redis.keys(
        `${loadConfig().queue.prefix}:rl:${user}:*`,
      );
      const values = await Promise.all(keys.map((k) => redis.get(k)));
      return values.reduce((sum, v) => sum + Number(v), 0);
    };
    beforeAll(() => {
      redis = new Redis(loadConfig().redisUrl);
    });
    afterAll(() => redis.quit());
    beforeEach(() => waitForFreshWindow(10_000));

    it('dakikalık sınırı aşan isteği 429 ve Retry-After ile reddeder', async () => {
      const user = `rl-${run}`;
      for (let i = 0; i < 3; i++) {
        await post('/locations', location(user)).expect(202);
      }
      const res = await post('/locations', location(user)).expect(429);
      const retryAfter = Number(res.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);

      // Başka kullanıcı etkilenmez.
      await post('/locations', location(`other-${run}`)).expect(202);
    });

    it('toplu istekteki her konum sınırdan düşer', async () => {
      const user = `batch-${run}`;
      await post('/locations/batch', {
        locations: [location(user), location(user)],
      }).expect(202);
      // Sayaç 2 < 3: istek kabul edilir, sayaç 4 olur.
      await post('/locations/batch', {
        locations: [location(user), location(user)],
      }).expect(202);
      await post('/locations', location(user)).expect(429);
    });

    it('sınırdan büyük birikmiş toplu istek pencere başında kabul edilir', async () => {
      // Sınır 3 iken 5 konumluk istek hiç geçemeseydi cihazın kuyruğu sonsuza dek tıkanırdı.
      const user = `backlog-${run}`;
      await post('/locations/batch', {
        locations: Array.from({ length: 5 }, () => location(user)),
      }).expect(202);
      await post('/locations', location(user)).expect(429);
    });

    it('reddedilen istek kotayı harcamaz', async () => {
      const user = `norefund-${run}`;
      for (let i = 0; i < 3; i++) {
        await post('/locations', location(user)).expect(202);
      }
      for (let i = 0; i < 3; i++) {
        await post('/locations/batch', {
          locations: [location(user), location(user)],
        }).expect(429);
      }
      expect(await counter(user)).toBe(3);
    });

    it('toplu istekte bir kullanıcı sınırdaysa istek bütünüyle reddedilir; diğerlerinin sayacı artmaz', async () => {
      const full = `full-${run}`;
      const other = `fresh-${run}`;
      for (let i = 0; i < 3; i++) {
        await post('/locations', location(full)).expect(202);
      }

      const res = await post('/locations/batch', {
        locations: [location(other), location(full), location(other)],
      }).expect(429);
      // Hata sınırdaki kullanıcıyı söyler, diğerini değil.
      expect(res.body.message).toContain(full);
      expect(res.body.message).not.toContain(other);
      expect(await counter(other)).toBe(0);
      expect(await counter(full)).toBe(3);

      // Diğer kullanıcının kotası bozulmadı: sınırına kadar gönderebilir.
      for (let i = 0; i < 3; i++) {
        await post('/locations', location(other)).expect(202);
      }
      await post('/locations', location(other)).expect(429);
    });
  });

  describe('istek kimliği ve metrikler', () => {
    it('gelen x-request-id korunur, yoksa üretilir', async () => {
      const kept = await request(app.getHttpServer())
        .get('/health')
        .set('x-request-id', 'mobil-abc-123')
        .expect(200);
      expect(kept.headers['x-request-id']).toBe('mobil-abc-123');

      const generated = await request(app.getHttpServer())
        .get('/health')
        .expect(200);
      expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('Prometheus formatında HTTP ve konum metriklerini yayınlar', async () => {
      // Kendi isteklerini üretir: başka testlerin yan etkisine dayanmaz, tek başına da çalışır.
      await waitForFreshWindow(10_000);
      await waitForQueueDrain(app);
      const scrape = async () => {
        const res = await request(app.getHttpServer())
          .get('/metrics')
          .expect(200);
        expect(res.headers['content-type']).toMatch(/text\/plain/);
        return res.text;
      };
      /** Metrik satırının değeri; seri henüz yoksa 0. */
      const value = (text: string, series: string) => {
        const line = text.split('\n').find((l) => l.startsWith(`${series} `));
        return line ? Number(line.slice(series.length + 1)) : 0;
      };
      const series = {
        http202:
          'http_request_duration_seconds_count{method="POST",route="/locations",status_code="202"}',
        accepted: 'locations_accepted_total',
        rateLimited: 'locations_rejected_total{reason="rate_limited"}',
        processed: 'location_job_duration_seconds_count{result="processed"}',
      };

      const before = await scrape();
      const user = `metrics-${run}`;
      for (let i = 0; i < 3; i++) {
        await post('/locations', location(user)).expect(202);
      }
      await post('/locations', location(user)).expect(429);
      await waitForQueueDrain(app);
      const after = await scrape();

      const delta = (name: keyof typeof series) =>
        value(after, series[name]) - value(before, series[name]);
      expect({
        http202: delta('http202'),
        accepted: delta('accepted'),
        rateLimited: delta('rateLimited'),
        processed: delta('processed'),
      }).toEqual({ http202: 3, accepted: 3, rateLimited: 1, processed: 3 });
    });
  });
});

describe('Kuyruk doluyken backpressure (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Worker yok: kuyruk işlenmez, eşik küçük.
    app = await createTestApp({
      withWorker: false,
      config: (c) => ({
        ...c,
        backpressure: { maxBacklog: 5, checkIntervalMs: 50 },
      }),
    });
    await resetState(app);
  });
  afterAll(async () => {
    await resetState(app);
    await app.close();
  });

  it('eşik aşılınca yeni konumları 503 ve Retry-After ile reddeder', async () => {
    const res = await request(app.getHttpServer())
      .post('/locations')
      .send(location(`bp-${run}`))
      .expect(202);
    expect(res.body.jobId).toBeDefined();

    // Eşik tüm şeritlerin toplamına uygulanır: işler farklı şeritlere dağılsın.
    await app.get(LocationLanes).addMany(
      Array.from({ length: 5 }, (_, i) => ({
        userId: `bp-${run}-${i}`,
        points: [],
      })),
    );
    // Kuyruk derinliği arka planda okunur: sabit süre yerine okumanın eşiği görmesini bekle.
    await vi.waitFor(() =>
      expect(() => app.get(QueueBackpressure).assertCapacity(1)).toThrow(),
    );

    const rejected = await request(app.getHttpServer())
      .post('/locations')
      .send(location(`bp-${run}`))
      .expect(503);
    expect(rejected.headers['retry-after']).toBe('5');
  });
});
