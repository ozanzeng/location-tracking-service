import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, MODA_SQUARE, resetState } from './helpers.js';
import { MAX_POLYGON_VERTICES } from '../src/config/limits.js';

describe('Areas (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetState(app));
  afterAll(() => app.close());

  it('alan oluşturur ve listeler', async () => {
    const created = await request(app.getHttpServer())
      .post('/areas')
      .send({ name: 'Moda', type: 'NO_RIDE', geometry: MODA_SQUARE })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Moda',
      type: 'NO_RIDE',
      geometry: MODA_SQUARE,
    });

    await request(app.getHttpServer())
      .post('/areas')
      .send({ name: 'Park', type: 'PARKING', geometry: MODA_SQUARE })
      .expect(201);

    const all = await request(app.getHttpServer()).get('/areas').expect(200);
    expect(all.body).toHaveLength(2);

    const filtered = await request(app.getHttpServer())
      .get('/areas?type=PARKING')
      .expect(200);
    expect(filtered.body.map((a: { name: string }) => a.name)).toEqual([
      'Park',
    ]);
  });

  it('kendini kesen poligonu PostGIS hatasıyla reddeder', async () => {
    const res = await request(app.getHttpServer())
      .post('/areas')
      .send({
        name: 'Papyon',
        type: 'SLOW',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 1],
              [1, 0],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      })
      .expect(400);
    expect(res.body.message).toMatch(/Self-intersection/);
  });

  it('belgelenen köşe sınırına kadar polygon kabul eder, fazlasını açıklamayla reddeder', async () => {
    // Moda açıklarında bir daire: köşe sayısı kapanış noktası dahil.
    const circle = (vertices: number) => {
      const ring = Array.from({ length: vertices - 1 }, (_, i) => {
        const a = (2 * Math.PI * i) / (vertices - 1);
        return [
          Number((29.0 + 0.01 * Math.cos(a)).toFixed(6)),
          Number((40.97 + 0.01 * Math.sin(a)).toFixed(6)),
        ];
      });
      return { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
    };
    const create = (vertices: number) =>
      request(app.getHttpServer())
        .post('/areas')
        .send({
          name: `Daire ${vertices}`,
          type: 'SLOW',
          geometry: circle(vertices),
        });

    await create(MAX_POLYGON_VERTICES).expect(201);
    const res = await create(MAX_POLYGON_VERTICES + 1).expect(400);
    expect(JSON.stringify(res.body)).toContain(
      `en fazla ${MAX_POLYGON_VERTICES} nokta`,
    );
  });

  it('bozuk JSON 400, gövde sınırını aşan istek 413 alır (500 değil)', async () => {
    await request(app.getHttpServer())
      .post('/areas')
      .set('content-type', 'application/json')
      .send('{bozuk')
      .expect(400);
    await request(app.getHttpServer())
      .post('/areas')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(600 * 1024) }))
      .expect(413);
  });

  it('bilinmeyen tip ve fazladan alanları reddeder', async () => {
    await request(app.getHttpServer())
      .post('/areas')
      .send({ name: 'X', type: 'LAVA', geometry: MODA_SQUARE })
      .expect(400);
    await request(app.getHttpServer())
      .post('/areas')
      .send({ name: 'X', type: 'SLOW', geometry: MODA_SQUARE, hack: true })
      .expect(400);
  });
});
