import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  INSIDE,
  logsFor,
  MODA_SQUARE,
  OUTSIDE,
  resetState,
  sendLocation,
  waitForQueueDrain,
} from './helpers.js';
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

  describe('düzenleme ve silme', () => {
    /** MODA_SQUARE'in batı yarısı: INSIDE (29.025) dışarıda kalır. */
    const WEST_HALF = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [29.02, 40.98],
          [29.024, 40.98],
          [29.024, 40.99],
          [29.02, 40.99],
          [29.02, 40.98],
        ],
      ],
    };
    const WEST = { lat: 40.985, lng: 29.021 };
    const server = () => app.getHttpServer();
    const createArea = async () =>
      (
        await request(server())
          .post('/areas')
          .send({ name: 'Moda', type: 'NO_RIDE', geometry: MODA_SQUARE })
          .expect(201)
      ).body as { id: string };

    it('ad ve tip değişir; giriş kayıtlarına dokunulmaz, kayıtlar yeni adla görünür', async () => {
      const { id } = await createArea();
      await sendLocation(app, 'u1', INSIDE, 0);
      await waitForQueueDrain(app);
      const res = await request(server())
        .patch(`/areas/${id}`)
        .send({ name: 'Moda Sahil', type: 'SLOW' })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'Moda Sahil', type: 'SLOW' });
      const [log] = (
        await request(server()).get('/logs').query({ userId: 'u1' })
      ).body.data;
      expect(log).toMatchObject({
        areaName: 'Moda Sahil',
        areaType: 'SLOW',
        exitTime: null,
      });
    });

    it('geometri küçülünce sadece dışarıda kalan scooterın girişi kapanır (AREA_CHANGED)', async () => {
      const { id } = await createArea();
      await sendLocation(app, 'disarida-kalan', INSIDE, 0);
      await sendLocation(app, 'iceride-kalan', WEST, 0);
      await waitForQueueDrain(app);

      await request(server())
        .patch(`/areas/${id}`)
        .send({ geometry: WEST_HALF })
        .expect(200);
      const [closed] = await logsFor(app, 'disarida-kalan');
      expect(closed.exitTime).not.toBeNull();
      expect(closed.exitReason).toBe('AREA_CHANGED');
      const [kept] = await logsFor(app, 'iceride-kalan');
      expect(kept).toMatchObject({ exitTime: null, exitReason: null });

      // Yeni şekil konum işlemede hemen geçerli: eski şeklin içindeki nokta artık giriş açmaz.
      await sendLocation(app, 'disarida-kalan', INSIDE, 10);
      await waitForQueueDrain(app);
      expect(await logsFor(app, 'disarida-kalan')).toHaveLength(1);
    });

    it('silinen alan listeden kalkar, girişleri kapanır (AREA_REMOVED), geçmiş kalır, yeni giriş açılmaz', async () => {
      const { id } = await createArea();
      await sendLocation(app, 'u2', INSIDE, 0);
      await waitForQueueDrain(app);

      await request(server()).delete(`/areas/${id}`).expect(204);
      expect((await request(server()).get('/areas')).body).toEqual([]);
      const [log] = await logsFor(app, 'u2');
      expect(log).toMatchObject({
        areaName: 'Moda',
        exitReason: 'AREA_REMOVED',
      });
      expect(log.exitTime).not.toBeNull();

      await sendLocation(app, 'u2', OUTSIDE, 10);
      await sendLocation(app, 'u2', INSIDE, 20);
      await waitForQueueDrain(app);
      expect(await logsFor(app, 'u2')).toHaveLength(1);

      await request(server()).delete(`/areas/${id}`).expect(404);
      await request(server())
        .patch(`/areas/${id}`)
        .send({ name: 'x' })
        .expect(404);
    });

    it('boş düzenleme, geçersiz poligon ve geçersiz kimlik 400', async () => {
      const { id } = await createArea();
      await request(server()).patch(`/areas/${id}`).send({}).expect(400);
      await request(server())
        .patch(`/areas/${id}`)
        .send({
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
      await request(server()).delete('/areas/kimlik-degil').expect(400);
    });
  });
});
