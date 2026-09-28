import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { IdleRentalSweeper } from '../src/fleet/idle-rental.sweeper.js';
import {
  createTestApp,
  INSIDE,
  registerRider,
  rentScooter,
  resetState,
  waitForQueueDrain,
} from './helpers.js';

const IDLE_MS = 10 * 60_000;

/**
 * Unutulan kiralama: scooter RENTAL_IDLE_TIMEOUT_MS boyunca konum göndermezse kiralama biter,
 * scooter boşa çıkar. Sessizlik sunucu saatiyle (seen_at) ölçülür; tarama elle çağrılır.
 */
describe('Sessiz kiralama (e2e)', () => {
  let app: INestApplication;
  let sweeper: IdleRentalSweeper;
  let db: DataSource;
  const ago = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000).toISOString();

  beforeAll(async () => {
    app = await createTestApp({
      config: (c) => ({
        ...c,
        // Zamanlayıcı testte kendiliğinden çalışmasın; tarama elle çağrılır.
        worker: {
          ...c.worker,
          rentalIdleTimeoutMs: IDLE_MS,
          signalLossSweepMs: 3_600_000,
        },
      }),
    });
    sweeper = app.get(IdleRentalSweeper);
    db = app.get(DataSource);
  });
  beforeEach(() => resetState(app));
  afterAll(async () => {
    await waitForQueueDrain(app);
    await app.close();
  });

  const sendAsRider = (token: string, scooterId: string) =>
    request(app.getHttpServer())
      .post('/locations')
      .set('authorization', `Bearer ${token}`)
      .send({ userId: scooterId, ...INSIDE, timestamp: ago(0.05) });

  it('konum gönderen kiralamaya dokunulmaz', async () => {
    const token = await registerRider(app, 'aktif-surucu');
    await rentScooter(app, token, 'scooter-01').expect(201);
    await sendAsRider(token, 'scooter-01').expect(202);
    await waitForQueueDrain(app);
    await expect(sweeper.sweep()).resolves.toBe(0);
  });

  it('sessiz kalan kiralama son sinyal anıyla biter; scooter boşa çıkar, sürücü artık gönderemez', async () => {
    const token = await registerRider(app, 'unutan');
    await rentScooter(app, token, 'scooter-02').expect(201);
    await sendAsRider(token, 'scooter-02').expect(202);
    await waitForQueueDrain(app);
    // Scooter 12 dk önce görüldü, kiralama 13 dk önce başladı (sunucu saati).
    const lastSeen = ago(12);
    await db.query(
      `UPDATE user_last_location SET seen_at = $1 WHERE user_id = 'scooter-02'`,
      [lastSeen],
    );
    await db.query(
      `UPDATE rentals SET started_at = $1 WHERE scooter_id = 'scooter-02'`,
      [ago(13)],
    );

    await expect(sweeper.sweep()).resolves.toBe(1);
    const [rental] = await db.query(
      `SELECT ended_at, end_reason FROM rentals WHERE scooter_id = 'scooter-02'`,
    );
    expect(rental).toEqual({
      ended_at: new Date(lastSeen),
      end_reason: 'SIGNAL_LOST',
    });
    // Önbellek silindi: sürücünün konumu artık kabul edilmez.
    await sendAsRider(token, 'scooter-02').expect(409);
    const next = await registerRider(app, 'sonraki');
    await rentScooter(app, next, 'scooter-02').expect(201);
  });

  it('hiç konum göndermeden bırakılan kiralama başlangıcından itibaren sayılır', async () => {
    const token = await registerRider(app, 'hic-gitmeyen');
    await rentScooter(app, token, 'scooter-03').expect(201);
    await expect(sweeper.sweep()).resolves.toBe(0);
    await db.query(
      `UPDATE rentals SET started_at = $1 WHERE scooter_id = 'scooter-03'`,
      [ago(11)],
    );
    await expect(sweeper.sweep()).resolves.toBe(1);
  });

  it('aynı anda iki tarama bir kiralamayı bir kez bitirir', async () => {
    const token = await registerRider(app, 'yaris');
    await rentScooter(app, token, 'scooter-04').expect(201);
    await db.query(
      `UPDATE rentals SET started_at = $1 WHERE scooter_id = 'scooter-04'`,
      [ago(11)],
    );
    const ended = await Promise.all([sweeper.sweep(), sweeper.sweep()]);
    expect(ended.reduce((a, b) => a + b, 0)).toBe(1);
  });
});
