import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  at,
  createTestApp,
  INSIDE,
  logsFor,
  MODA_SQUARE,
  OUTSIDE,
  resetState,
  sendLocation,
  waitForQueueDrain,
} from './helpers.js';

/**
 * Case metnindeki gereksinimlerin madde madde doğrulaması. Her describe bloğu metindeki
 * bir cümleye karşılık gelir; ayrıntılı senaryolar diğer e2e dosyalarındadır.
 */
describe('Case gereksinimleri (e2e)', () => {
  let app: INestApplication;

  const http = () => request(app.getHttpServer());
  const createArea = async (name: string, geometry = MODA_SQUARE) =>
    (
      await http()
        .post('/areas')
        .send({ name, type: 'NO_RIDE', geometry })
        .expect(201)
    ).body as { id: string };

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetState(app));
  afterAll(() => app.close());

  describe('POST /locations: User ID, Latitude, Longitude, Timestamp', () => {
    const valid = {
      userId: 'user-1',
      lat: 40.985,
      lng: 29.025,
      timestamp: '2026-01-01T09:00:00.000Z',
    };

    it('dört alanı içeren konumu kabul eder', async () => {
      const res = await http().post('/locations').send(valid).expect(202);
      expect(res.body).toEqual({
        jobId: expect.any(String),
        recordedAt: valid.timestamp,
      });
    });

    it.each(['userId', 'lat', 'lng', 'timestamp'])(
      '%s eksikse 400 döner',
      async (field) => {
        const body: Record<string, unknown> = { ...valid };
        delete body[field];
        const res = await http().post('/locations').send(body).expect(400);
        expect(JSON.stringify(res.body.message)).toContain(field);
      },
    );
  });

  describe('POST /areas: polygon alan tanımlama', () => {
    it('GeoJSON Polygon ile alan oluşturur', async () => {
      const res = await http()
        .post('/areas')
        .send({ name: 'Moda', type: 'NO_RIDE', geometry: MODA_SQUARE })
        .expect(201);
      expect(res.body).toMatchObject({
        id: expect.any(String),
        name: 'Moda',
        geometry: MODA_SQUARE,
      });
    });

    it('polygon olmayan geometriyi reddeder', async () => {
      await http()
        .post('/areas')
        .send({
          name: 'Nokta',
          type: 'NO_RIDE',
          geometry: { type: 'Point', coordinates: [29, 41] },
        })
        .expect(400);
    });
  });

  describe('GET /areas: tanımlı alanları listeler', () => {
    it('oluşturulan tüm alanları geometrileriyle döner', async () => {
      const a = await createArea('A');
      const b = await createArea('B');
      const res = await http().get('/areas').expect(200);
      expect(res.body.map((x: { id: string }) => x.id).sort()).toEqual(
        [a.id, b.id].sort(),
      );
      expect(res.body[0].geometry.type).toBe('Polygon');
    });
  });

  describe('Konum bir alana girdiğinde giriş kaydedilir', () => {
    it('GET /logs kaydı User ID, Area ID ve Entry Time içerir', async () => {
      const area = await createArea('Moda');
      await sendLocation(app, 'user-1', OUTSIDE, 0);
      await sendLocation(app, 'user-1', INSIDE, 5);
      await waitForQueueDrain(app);

      const logs = await logsFor(app, 'user-1');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        userId: 'user-1',
        areaId: area.id,
        entryTime: at(5),
      });
    });

    it('alan dışındaki konum kayıt üretmez', async () => {
      await createArea('Moda');
      await sendLocation(app, 'user-1', OUTSIDE, 0);
      await waitForQueueDrain(app);
      expect(await logsFor(app, 'user-1')).toEqual([]);
    });

    it('5 saniyede bir içeride kalan kullanıcı için tek giriş kaydı tutulur', async () => {
      await createArea('Moda');
      for (let s = 0; s <= 30; s += 5) {
        await sendLocation(app, 'user-1', INSIDE, s);
      }
      await waitForQueueDrain(app);
      expect(await logsFor(app, 'user-1')).toHaveLength(1);
    });

    it('çakışan iki alana aynı anda girişte her alan için ayrı kayıt açılır', async () => {
      const outer = await createArea('Büyük', {
        type: 'Polygon',
        coordinates: [
          [
            [29.0, 40.97],
            [29.05, 40.97],
            [29.05, 41.0],
            [29.0, 41.0],
            [29.0, 40.97],
          ],
        ],
      });
      const inner = await createArea('Küçük');
      await sendLocation(app, 'user-1', INSIDE, 0);
      await waitForQueueDrain(app);

      const areaIds = (await logsFor(app, 'user-1'))
        .map((l) => l.areaId)
        .sort();
      expect(areaIds).toEqual([outer.id, inner.id].sort());
    });

    it('polygon içindeki delikte (hole) bulunan konum giriş sayılmaz', async () => {
      await createArea('Delikli', {
        type: 'Polygon',
        coordinates: [
          MODA_SQUARE.coordinates[0],
          [
            [29.024, 40.984],
            [29.026, 40.984],
            [29.026, 40.986],
            [29.024, 40.986],
            [29.024, 40.984],
          ],
        ],
      });
      await sendLocation(app, 'user-1', INSIDE, 0); // (40.985, 29.025) deliğin ortası
      await waitForQueueDrain(app);
      expect(await logsFor(app, 'user-1')).toEqual([]);
    });
  });

  describe('Trafik artışı: çok sayıda eşzamanlı kullanıcı', () => {
    it('100 kullanıcının 5 sn aralıklı konumları doğru sayıda giriş üretir', async () => {
      await createArea('Moda');
      const users = Array.from({ length: 100 }, (_, i) => `load-${i}`);

      // Her kullanıcı: dışarı → içeri → içeri → dışarı → içeri = 2 giriş.
      const path = [OUTSIDE, INSIDE, INSIDE, OUTSIDE, INSIDE];
      for (const [step, point] of path.entries()) {
        await Promise.all(
          users.map((u) => sendLocation(app, u, point, step * 5)),
        );
        await waitForQueueDrain(app);
      }

      const res = await http().get('/logs').query({ limit: 500 }).expect(200);
      expect(res.body.data).toHaveLength(200);
      const perUser = new Map<string, number>();
      for (const l of res.body.data as Array<{ userId: string }>) {
        perUser.set(l.userId, (perUser.get(l.userId) ?? 0) + 1);
      }
      expect([...perUser.values()].every((n) => n === 2)).toBe(true);
      expect(perUser.size).toBe(100);
    });
  });

  describe('Veri büyümesi: loglar sayfalanır', () => {
    it('limit ve nextCursor ile tüm kayıtlar sayfa sayfa alınır', async () => {
      await createArea('Moda');
      await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          sendLocation(app, `page-${i}`, INSIDE, i),
        ),
      );
      await waitForQueueDrain(app);

      const ids = new Set<string>();
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res: request.Response = await http()
          .get('/logs')
          .query({ limit: 10, ...(cursor ? { cursor } : {}) })
          .expect(200);
        res.body.data.forEach((l: { id: string }) => ids.add(l.id));
        cursor = res.body.nextCursor;
        pages++;
      } while (cursor);
      expect(ids.size).toBe(25);
      expect(pages).toBe(3);
    });
  });
});
