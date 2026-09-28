import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { GeofenceService } from '../src/geofence/geofence.service.js';
import {
  at,
  createTestApp,
  INSIDE,
  MODA_SQUARE,
  OUTSIDE,
  resetState,
} from './helpers.js';

describe('GET /logs (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetState(app);
    await request(app.getHttpServer())
      .post('/areas')
      .send({ name: 'Moda', type: 'NO_RIDE', geometry: MODA_SQUARE })
      .expect(201);

    // Kuyruğu atlayıp doğrudan işleyerek deterministik 5 giriş üret:
    // 0,2,4,6,8. saniyelerde giriş; 1,3,5,7. saniyelerde çıkış (son giriş açık kalır).
    const geofence = app.get(GeofenceService);
    for (let i = 0; i < 9; i++) {
      await geofence.process({
        userId: 'u1',
        ...(i % 2 === 0 ? INSIDE : OUTSIDE),
        recordedAt: at(i),
      });
    }
  });
  afterAll(() => app.close());

  const entryTimes = (res: request.Response) =>
    res.body.data.map((l: { entryTime: string }) => l.entryTime);

  it('cursor ile tüm sayfaları tekrar ve boşluk olmadan gezer', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res: request.Response = await request(app.getHttpServer())
        .get('/logs')
        .query({ limit: 2, ...(cursor ? { cursor } : {}) })
        .expect(200);
      seen.push(...entryTimes(res));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(seen).toEqual([at(8), at(6), at(4), at(2), at(0)]);
  });

  it('giriş kaydı istenen alanları içerir', async () => {
    const res = await request(app.getHttpServer())
      .get('/logs')
      .query({ limit: 2 })
      .expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        userId: 'u1',
        areaName: 'Moda',
        areaType: 'NO_RIDE',
        entryTime: at(8),
        exitTime: null,
      }),
      expect.objectContaining({ entryTime: at(6), exitTime: at(7) }),
    ]);
  });

  it('active ve zaman aralığı filtreleri', async () => {
    const active = await request(app.getHttpServer())
      .get('/logs')
      .query({ active: true })
      .expect(200);
    expect(entryTimes(active)).toEqual([at(8)]);

    const range = await request(app.getHttpServer())
      .get('/logs')
      .query({ active: false, from: at(2), to: at(6) })
      .expect(200);
    expect(entryTimes(range)).toEqual([at(4), at(2)]);
  });

  it('veritabanı bağlantısı zaman aşımlarıyla açılır', async () => {
    const [row] = await app
      .get(DataSource)
      .query(
        `SELECT current_setting('statement_timeout') AS st, current_setting('idle_in_transaction_session_timeout') AS it`,
      );
    expect(row).toEqual({ st: '5s', it: '30s' });
  });

  it('Swagger belgesi sayısal sorgu parametrelerini sınırlarıyla birlikte sayı olarak gösterir', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const param = (path: string, name: string) =>
      body.paths[path].get.parameters.find(
        (p: { name: string }) => p.name === name,
      ).schema;
    expect(param('/logs', 'limit')).toMatchObject({
      type: 'number',
      default: 50,
      maximum: 500,
    });
    expect(param('/locations/latest', 'sinceMinutes')).toMatchObject({
      type: 'number',
      maximum: 1440,
    });
    expect(param('/locations/latest', 'limit')).toMatchObject({
      type: 'number',
      maximum: 5000,
    });
  });

  it('geçersiz sorgu parametrelerini reddeder', async () => {
    await request(app.getHttpServer()).get('/logs?limit=0').expect(400);
    await request(app.getHttpServer()).get('/logs?areaId=nope').expect(400);
    await request(app.getHttpServer()).get('/logs?active=evet').expect(400);
    await request(app.getHttpServer()).get('/logs?cursor=bozuk').expect(400);
  });

  it("Postgres'in çözemeyeceği zaman ve cursor değerlerini 500 yerine 400 ile reddeder", async () => {
    const cursor = (text: string) => Buffer.from(text).toString('base64url');
    for (const query of [
      'from=2024',
      'from=2026-02-30T00:00:00Z',
      'to=2026-W05',
      'to=2026-09-28T10:00:00',
      `cursor=${cursor('2026-01-01T00:00:00Z|99999999999999999999')}`,
      `cursor=${cursor('2026-02-30T00:00:00Z|1')}`,
    ]) {
      const res = await request(app.getHttpServer()).get(`/logs?${query}`);
      expect({ query, status: res.status }).toEqual({ query, status: 400 });
    }
    await request(app.getHttpServer())
      .get('/logs?from=2026-01-01T00:00:00Z')
      .expect(200);
  });
});
