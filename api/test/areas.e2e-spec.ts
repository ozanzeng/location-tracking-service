import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, MODA_SQUARE, resetState } from './helpers.js';

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
    expect(filtered.body.map((a: { name: string }) => a.name)).toEqual(['Park']);
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
