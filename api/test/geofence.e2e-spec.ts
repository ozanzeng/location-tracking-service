import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { GeofenceService } from '../src/geofence/geofence.service.js';
import {
  createTestApp,
  INSIDE,
  MODA_SQUARE,
  OUTSIDE,
  resetState,
  waitForQueueDrain,
} from './helpers.js';

describe('Konum → alan giriş/çıkış (e2e)', () => {
  let app: INestApplication;
  let areaId: string;
  const t0 = Date.parse('2026-01-01T09:00:00.000Z');
  const at = (seconds: number) => new Date(t0 + seconds * 1000).toISOString();

  const sendLocation = (
    userId: string,
    point: { lat: number; lng: number },
    seconds: number,
  ) =>
    request(app.getHttpServer())
      .post('/locations')
      .send({ userId, ...point, timestamp: at(seconds) })
      .expect(202);

  const logsFor = async (userId: string) => {
    const res = await request(app.getHttpServer())
      .get(`/logs?userId=${userId}`)
      .expect(200);
    return res.body.data as Array<{
      entryTime: string;
      exitTime: string | null;
    }>;
  };

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(app);
    const res = await request(app.getHttpServer())
      .post('/areas')
      .send({ name: 'Moda', type: 'NO_RIDE', geometry: MODA_SQUARE })
      .expect(201);
    areaId = res.body.id;
  });
  afterAll(() => app.close());

  it('girişi loglar, çıkışta exitTime dolar, içeride kalmak yeni log üretmez', async () => {
    await sendLocation('u1', OUTSIDE, 0);
    await waitForQueueDrain(app);
    await sendLocation('u1', INSIDE, 1);
    await waitForQueueDrain(app);
    await sendLocation('u1', INSIDE, 2);
    await waitForQueueDrain(app);
    await sendLocation('u1', OUTSIDE, 3);
    await waitForQueueDrain(app);

    const logs = await logsFor('u1');
    expect(logs).toEqual([
      expect.objectContaining({
        userId: 'u1',
        areaId,
        entryTime: at(1),
        exitTime: at(3),
      }),
    ]);
  });

  it('çıkıp tekrar giren kullanıcı için yeni giriş kaydı açar', async () => {
    for (const [i, point] of [INSIDE, OUTSIDE, INSIDE].entries()) {
      await sendLocation('u1', point, i);
      await waitForQueueDrain(app);
    }

    const logs = await logsFor('u1');
    expect(logs.map((l) => [l.entryTime, l.exitTime])).toEqual([
      [at(2), null],
      [at(0), at(1)],
    ]);
  });

  it('kendisinden eski bir konumu yok sayar', async () => {
    await sendLocation('u1', INSIDE, 10);
    await waitForQueueDrain(app);
    // Ağda gecikmiş, daha önce ölçülmüş bir "dışarıda" konumu geç geliyor.
    await sendLocation('u1', OUTSIDE, 5);
    await waitForQueueDrain(app);

    const logs = await logsFor('u1');
    expect(logs.map((l) => [l.entryTime, l.exitTime])).toEqual([[at(10), null]]);
  });

  it('aynı kullanıcı için 50 eşzamanlı istek tam olarak 1 giriş üretir', async () => {
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => sendLocation('u1', INSIDE, i)),
    );
    await waitForQueueDrain(app);

    const logs = await logsFor('u1');
    expect(logs).toHaveLength(1);
    expect(logs[0].exitTime).toBeNull();
  });

  it('servis seviyesinde paralel işleme advisory lock ile seri hale gelir', async () => {
    const geofence = app.get(GeofenceService);
    // Aynı zaman damgalı 50 kopya: kilit olmasa birden fazlası "önceki durum yok" görürdü.
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        geofence.process({ userId: 'u2', ...INSIDE, recordedAt: at(1) }),
      ),
    );

    expect(results.filter((r) => r.status === 'processed')).toHaveLength(1);
    const logs = await logsFor('u2');
    expect(logs).toHaveLength(1);
  });

  it('farklı kullanıcılar birbirini etkilemez', async () => {
    await Promise.all([
      sendLocation('a', INSIDE, 1),
      sendLocation('b', INSIDE, 1),
      sendLocation('c', OUTSIDE, 1),
    ]);
    await waitForQueueDrain(app);

    const res = await request(app.getHttpServer())
      .get(`/logs?areaId=${areaId}`)
      .expect(200);
    expect(
      res.body.data.map((l: { userId: string }) => l.userId).sort(),
    ).toEqual(['a', 'b']);
  });

  it('timestamp olmayan konumu 400 ile reddeder', async () => {
    await request(app.getHttpServer())
      .post('/locations')
      .send({ userId: 'u1', ...INSIDE })
      .expect(400);
  });

  it('gelecek tarihli konumu 400 ile reddeder', async () => {
    await request(app.getHttpServer())
      .post('/locations')
      .send({
        userId: 'u1',
        ...INSIDE,
        timestamp: new Date(Date.now() + 10 * 60_000).toISOString(),
      })
      .expect(400);
  });
});
