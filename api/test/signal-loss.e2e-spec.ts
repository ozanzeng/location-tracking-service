import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { SignalLossSweeper } from '../src/geofence/signal-loss.sweeper.js';
import {
  createTestApp,
  INSIDE,
  logsFor,
  MODA_SQUARE,
  OUTSIDE,
  registerRider,
  rentScooter,
  resetState,
  waitForQueueDrain,
} from './helpers.js';

const TIMEOUT_MS = 10 * 60_000;
const NOW = new Date();
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

/**
 * Sinyal kaybı: uzun süre konum göndermeyen scooter'ın açık girişleri son sinyal anıyla
 * kapanır, kiralaması biter. Tarama elle, sabit bir "şimdi" ile çağrılır.
 */
describe('Sinyal kaybı (e2e)', () => {
  let app: INestApplication;
  let sweeper: SignalLossSweeper;

  const send = (userId: string, point: typeof INSIDE, at: string) =>
    request(app.getHttpServer())
      .post('/locations')
      .send({ userId, ...point, timestamp: at })
      .expect(202);

  beforeAll(async () => {
    app = await createTestApp({
      config: (c) => ({
        ...c,
        // Zamanlayıcı testte kendiliğinden çalışmasın; tarama elle çağrılır.
        worker: {
          ...c.worker,
          signalLossTimeoutMs: TIMEOUT_MS,
          signalLossCheckMs: 3_600_000,
        },
      }),
    });
    sweeper = app.get(SignalLossSweeper);
  });
  beforeEach(async () => {
    await resetState(app);
    await request(app.getHttpServer())
      .post('/areas')
      .send({ name: 'Moda', type: 'NO_RIDE', geometry: MODA_SQUARE })
      .expect(201);
  });
  afterAll(async () => {
    await waitForQueueDrain(app);
    await app.close();
  });

  it("sessiz kalan scooter'ın açık girişi son sinyal anıyla kapanır ve işaretlenir", async () => {
    await send('sessiz', INSIDE, minutesAgo(15));
    await waitForQueueDrain(app);

    await expect(sweeper.sweep(NOW)).resolves.toEqual({
      closedVisits: 1,
      endedRentals: 0,
    });
    const [log] = await logsFor(app, 'sessiz');
    expect(log).toMatchObject({
      exitTime: minutesAgo(15),
      exitReason: 'SIGNAL_LOST',
    });
  });

  it('süre dolmadıysa dokunulmaz; normal çıkışın sebebi boştur', async () => {
    await send('aktif', INSIDE, minutesAgo(5));
    await send('normal', INSIDE, minutesAgo(3));
    await send('normal', OUTSIDE, minutesAgo(2));
    await waitForQueueDrain(app);

    await expect(sweeper.sweep(NOW)).resolves.toEqual({
      closedVisits: 0,
      endedRentals: 0,
    });
    expect((await logsFor(app, 'aktif'))[0].exitTime).toBeNull();
    expect((await logsFor(app, 'normal'))[0]).toMatchObject({
      exitTime: minutesAgo(2),
      exitReason: null,
    });
  });

  it('cihaz geri dönünce (ya da çevrimdışı konumları gelince) yeni giriş açılır', async () => {
    await send('donen', INSIDE, minutesAgo(30));
    await waitForQueueDrain(app);
    await sweeper.sweep(NOW);

    await send('donen', INSIDE, minutesAgo(1));
    await waitForQueueDrain(app);
    const logs = await logsFor(app, 'donen');
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ exitTime: null, exitReason: null });
    expect(logs[1]).toMatchObject({ exitReason: 'SIGNAL_LOST' });
  });

  it('aynı anda iki tarama bir kaydı bir kez kapatır', async () => {
    await send('yaris', INSIDE, minutesAgo(15));
    await waitForQueueDrain(app);
    const results = await Promise.all([sweeper.sweep(NOW), sweeper.sweep(NOW)]);
    expect(results.reduce((n, r) => n + r.closedVisits, 0)).toBe(1);
  });

  it('sessiz kalan kiralama son sinyal anıyla biter, scooter boşa çıkar, sürücü artık gönderemez', async () => {
    const token = await registerRider(app, 'unutan');
    await rentScooter(app, token, 'scooter-01').expect(201);
    const db = app.get(DataSource);
    await db.query(
      `UPDATE rentals SET started_at = $1 WHERE scooter_id = 'scooter-01'`,
      [minutesAgo(13)],
    );
    await send('scooter-01', INSIDE, minutesAgo(12));
    await waitForQueueDrain(app);

    await expect(sweeper.sweep(NOW)).resolves.toEqual({
      closedVisits: 1,
      endedRentals: 1,
    });
    const [rental] = await db.query(
      `SELECT ended_at, end_reason FROM rentals WHERE scooter_id = 'scooter-01'`,
    );
    expect(rental).toEqual({
      ended_at: new Date(minutesAgo(12)),
      end_reason: 'SIGNAL_LOST',
    });
    await request(app.getHttpServer())
      .post('/locations')
      .set('authorization', `Bearer ${token}`)
      .send({ userId: 'scooter-01', ...INSIDE, timestamp: minutesAgo(0.1) })
      .expect(409);
    const other = await registerRider(app, 'sonraki');
    await rentScooter(app, other, 'scooter-01').expect(201);
  });

  it('hiç konum göndermeden bırakılan kiralama başlangıcından itibaren sayılır', async () => {
    const token = await registerRider(app, 'hic-gitmeyen');
    await rentScooter(app, token, 'scooter-02').expect(201);
    const db = app.get(DataSource);
    await expect(sweeper.sweep(NOW)).resolves.toMatchObject({
      endedRentals: 0,
    });
    await db.query(
      `UPDATE rentals SET started_at = $1 WHERE scooter_id = 'scooter-02'`,
      [minutesAgo(11)],
    );
    await expect(sweeper.sweep(NOW)).resolves.toMatchObject({
      endedRentals: 1,
    });
  });
});
