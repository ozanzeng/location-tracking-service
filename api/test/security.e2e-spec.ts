import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { LOCATION_JOB, LOCATION_QUEUE } from '../src/queue/location-job.js';
import {
  createTestApp,
  INSIDE,
  resetState,
  waitForQueueDrain,
} from './helpers.js';

const KEY = 'test-key';
// Rate limit sayaçları Redis'te dakikalık tutulur; koşular birbirini etkilemesin.
const run = Date.now().toString(36);
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
        security: { ...c.security, apiKeys: [KEY], userRateLimitPerMinute: 3 },
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

    it('health ve metrics anahtar istemez', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
      await request(app.getHttpServer()).get('/metrics').expect(200);
    });
  });

  describe('kullanıcı başına rate limit', () => {
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
      await post('/locations/batch', {
        locations: [location(user), location(user)],
      }).expect(429);
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
      await waitForQueueDrain(app);
      const res = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toMatch(
        /http_request_duration_seconds_count\{method="POST",route="\/locations",status_code="202"\} \d+/,
      );
      expect(res.text).toMatch(/locations_accepted_total \d+/);
      expect(res.text).toMatch(
        /locations_rejected_total\{reason="rate_limited"\} \d+/,
      );
      expect(res.text).toMatch(
        /location_job_duration_seconds_count\{result="processed"\} \d+/,
      );
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

    const queue = app.get<Queue>(getQueueToken(LOCATION_QUEUE));
    await queue.addBulk(
      Array.from({ length: 5 }, () => ({
        name: LOCATION_JOB,
        data: { userId: `bp-${run}`, points: [] },
      })),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));

    const rejected = await request(app.getHttpServer())
      .post('/locations')
      .send(location(`bp-${run}`))
      .expect(503);
    expect(rejected.headers['retry-after']).toBe('5');
  });
});
