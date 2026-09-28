import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LocationLanes } from '../src/queue/location-lanes.js';
import {
  createTestApp,
  INSIDE,
  logsFor,
  MODA_SQUARE,
  resetState,
  waitForQueueDrain,
} from './helpers.js';

const TIMEOUT_MS = 1500;

/**
 * Konum göndermeyi bırakan kullanıcı: açık girişi sonsuza dek "içeride" kalmaz. Gerçek worker
 * (kısa süreler): API → kuyruk → worker → arama zamanlayıcısı.
 */
describe('Sinyal kaybı (e2e)', () => {
  let app: INestApplication;
  const now = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
  const send = (userId: string, timestamp: string) =>
    request(app.getHttpServer())
      .post('/locations')
      .send({ userId, ...INSIDE, timestamp })
      .expect(202);

  beforeAll(async () => {
    app = await createTestApp({
      config: (c) => ({
        ...c,
        worker: {
          ...c.worker,
          signalLossTimeoutMs: TIMEOUT_MS,
          signalLossSweepMs: 200,
        },
      }),
    });
    await resetState(app);
    await request(app.getHttpServer())
      .post('/areas')
      .send({ name: 'Moda', type: 'PARKING', geometry: MODA_SQUARE })
      .expect(201);
  });
  afterAll(() => app.close());

  it('sessiz kalan kullanıcının girişi "sinyal kesildi" olarak kapanır; konum gönderen açık kalır', async () => {
    const silentAt = now(-1000);
    await send('sessiz', silentAt);
    // Diğeri sürekli konum gönderiyor ama cihaz saati 2 saat geride: sessiz sayılmamalı.
    const skew = -2 * 3_600_000;
    await send('aktif', now(skew));
    await waitForQueueDrain(app);

    const deadline = Date.now() + 3 * TIMEOUT_MS;
    while (Date.now() < deadline) {
      await send('aktif', now(skew));
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await waitForQueueDrain(app);

    const [lost] = await logsFor(app, 'sessiz');
    expect(lost).toMatchObject({
      entryTime: silentAt,
      exitReason: 'SIGNAL_LOST',
      lastSeenAt: null,
    });
    // Çıkış zamanı girişin kapatıldığı an: son konumdan en az TIMEOUT_MS sonra, şimdiden önce.
    const exitAt = Date.parse(lost.exitTime!);
    expect(exitAt - Date.parse(silentAt)).toBeGreaterThanOrEqual(TIMEOUT_MS);
    expect(exitAt).toBeLessThanOrEqual(Date.now());
    expect(await logsFor(app, 'aktif')).toEqual([
      expect.objectContaining({ exitTime: null, exitReason: null }),
    ]);
  });

  it('sinyali kesilen kullanıcı aynı alanda yeniden görülünce yeni giriş açılır', async () => {
    await send('sessiz', now());
    await waitForQueueDrain(app);
    const logs = await logsFor(app, 'sessiz');
    expect(logs.map((l) => l.exitReason)).toEqual([null, 'SIGNAL_LOST']);
  });
});

describe('Kuyrukta bekleyen en eski iş (e2e, gerçek Redis)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Worker yok: konumlar kuyrukta bekler.
    app = await createTestApp({ withWorker: false });
    await resetState(app);
  });
  afterAll(async () => {
    await resetState(app);
    await app.close();
  });

  it('kuyruk boşken 0; bekleyen işin yaşını verir (sinyal kaybı araması bu kadar pay bırakır)', async () => {
    const lanes = app.get(LocationLanes);
    expect(await lanes.oldestPendingAgeMs()).toBe(0);
    await request(app.getHttpServer())
      .post('/locations')
      .send({
        userId: 'bekleyen',
        ...INSIDE,
        timestamp: new Date().toISOString(),
      })
      .expect(202);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const age = await lanes.oldestPendingAgeMs();
    expect(age).toBeGreaterThanOrEqual(400);
    expect(age).toBeLessThan(5000);
  });
});
