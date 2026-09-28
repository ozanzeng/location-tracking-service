import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { laneOf } from '../src/queue/lanes.js';
import { LocationLanes } from '../src/queue/location-lanes.js';
import { GeofenceService } from '../src/geofence/geofence.service.js';
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
import {
  LEGACY_LOCATION_QUEUE,
  LOCATION_JOB,
} from '../src/queue/queue.constants.js';

describe('Konum → alan giriş/çıkış (e2e)', () => {
  let app: INestApplication;
  let areaId: string;

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
    await sendLocation(app, 'u1', OUTSIDE, 0);
    await waitForQueueDrain(app);
    await sendLocation(app, 'u1', INSIDE, 1);
    await waitForQueueDrain(app);
    await sendLocation(app, 'u1', INSIDE, 2);
    await waitForQueueDrain(app);
    await sendLocation(app, 'u1', OUTSIDE, 3);
    await waitForQueueDrain(app);

    const logs = await logsFor(app, 'u1');
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
      await sendLocation(app, 'u1', point, i);
      await waitForQueueDrain(app);
    }

    const logs = await logsFor(app, 'u1');
    expect(logs.map((l) => [l.entryTime, l.exitTime])).toEqual([
      [at(2), null],
      [at(0), at(1)],
    ]);
  });

  it('kendisinden eski bir konumu yok sayar', async () => {
    await sendLocation(app, 'u1', INSIDE, 10);
    await waitForQueueDrain(app);
    // Ağda gecikmiş, daha önce ölçülmüş bir "dışarıda" konumu geç geliyor.
    await sendLocation(app, 'u1', OUTSIDE, 5);
    await waitForQueueDrain(app);

    const logs = await logsFor(app, 'u1');
    expect(logs.map((l) => [l.entryTime, l.exitTime])).toEqual([
      [at(10), null],
    ]);
  });

  it('aynı kullanıcı için 50 eşzamanlı istek tam olarak 1 giriş üretir', async () => {
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => sendLocation(app, 'u1', INSIDE, i)),
    );
    await waitForQueueDrain(app);

    const logs = await logsFor(app, 'u1');
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
    const logs = await logsFor(app, 'u2');
    expect(logs).toHaveLength(1);
  });

  it('farklı kullanıcılar birbirini etkilemez', async () => {
    await Promise.all([
      sendLocation(app, 'a', INSIDE, 1),
      sendLocation(app, 'b', INSIDE, 1),
      sendLocation(app, 'c', OUTSIDE, 1),
    ]);
    await waitForQueueDrain(app);

    const res = await request(app.getHttpServer())
      .get(`/logs?areaId=${areaId}`)
      .expect(200);
    expect(
      res.body.data.map((l: { userId: string }) => l.userId).sort(),
    ).toEqual(['a', 'b']);
  });

  it('toplu istekte sırası karışık gönderilen noktaları zamana göre işler', async () => {
    // İçeride → dışarıda → içeride; ters sırada gönderiliyor.
    const res = await request(app.getHttpServer())
      .post('/locations/batch')
      .send({
        locations: [
          { userId: 'u4', ...INSIDE, timestamp: at(2) },
          { userId: 'u4', ...OUTSIDE, timestamp: at(1) },
          { userId: 'u4', ...INSIDE, timestamp: at(0) },
          { userId: 'u5', ...INSIDE, timestamp: at(0) },
        ],
      })
      .expect(202);
    expect(res.body.accepted).toBe(4);
    expect(res.body.jobIds).toHaveLength(2);
    await waitForQueueDrain(app);

    expect(
      (await logsFor(app, 'u4')).map((l) => [l.entryTime, l.exitTime]),
    ).toEqual([
      [at(2), null],
      [at(0), at(1)],
    ]);
    expect(await logsFor(app, 'u5')).toHaveLength(1);
  });

  it('aynı kullanıcının kuyrukta birikmiş ayrı işleri sırayla işlenir', async () => {
    // Uzun kopukluktan sonra cihaz birikmiş konumları art arda isteklerle gönderir ve işler
    // kuyrukta birikir. Paralel işlenselerdi sonraki önce bitebilir, öncekinin noktaları
    // "eski" sayılıp atlanır ve aradaki girişler kaybolurdu. Şerit: aynı kullanıcının işleri
    // tek tek, geliş sırasıyla. Birikmeyi garantilemek için şerit istekler bitene kadar durur.
    // Not: tek süreçte paralel işler DB kilidine alındıkları sırayla girdiği için bu test
    // "şeritte tek iş" kuralını tek başına kanıtlamaz; o kural lanes.e2e-spec.ts'te iki
    // worker ve gecikmeyle doğrulanır. Bu test API → şerit → worker → log akışını birikmiş
    // kuyrukla uçtan uca doğrular.
    const lanes = app.get(LocationLanes);
    const lane = lanes.queues()[laneOf('u7', lanes.count)];
    await lane.pause();
    try {
      for (let s = 0; s < 30; s++) {
        await sendLocation(app, 'u7', s % 2 ? INSIDE : OUTSIDE, s);
      }
      expect(await lane.getWaitingCount()).toBe(30);
    } finally {
      await lane.resume();
    }
    await waitForQueueDrain(app);

    const logs = await logsFor(app, 'u7');
    expect(logs).toHaveLength(15);
    expect(logs.at(-1)).toMatchObject({ entryTime: at(1), exitTime: at(2) });
    expect(logs[0]).toMatchObject({ entryTime: at(29), exitTime: null });
  });

  it('şeritlerden önceki kuyrukta kalmış eski biçimdeki (tek konumlu) iş de işlenir', async () => {
    const legacy = app
      .get(LocationLanes)
      .queues()
      .find((q) => q.name === LEGACY_LOCATION_QUEUE)!;
    await legacy.add(LOCATION_JOB, {
      userId: 'u8',
      ...INSIDE,
      recordedAt: at(0),
    } as never);
    await waitForQueueDrain(app);
    expect(await logsFor(app, 'u8')).toHaveLength(1);
  });

  it('toplu istekte bir konum geçersizse hiçbirini almaz', async () => {
    await request(app.getHttpServer())
      .post('/locations/batch')
      .send({
        locations: [
          { userId: 'u6', ...INSIDE, timestamp: at(0) },
          { userId: 'u6', lat: 200, lng: 0, timestamp: at(1) },
        ],
      })
      .expect(400);
    await waitForQueueDrain(app);
    expect(await logsFor(app, 'u6')).toEqual([]);
  });

  it('timestamp olmayan konumu 400 ile reddeder', async () => {
    await request(app.getHttpServer())
      .post('/locations')
      .send({ userId: 'u1', ...INSIDE })
      .expect(400);
  });

  it("çözülemeyen ya da saat dilimsiz timestamp'i 500 yerine 400 ile reddeder", async () => {
    // Sürücü uygulaması 5xx'te noktayı tekrar gönderir; 500 dönseydi kuyruğu kalıcı tıkanırdı.
    for (const timestamp of [
      '20260928T100000Z',
      '2026-W39-1',
      '2026-02-30T10:00:00Z',
      '2026-01-01T09:00:00',
    ]) {
      const res = await request(app.getHttpServer())
        .post('/locations')
        .send({ userId: 'u1', ...INSIDE, timestamp });
      expect({ timestamp, status: res.status }).toEqual({
        timestamp,
        status: 400,
      });
    }
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
