import type { DataSource } from 'typeorm';
import { purgeClosedLogs } from '../../src/logs/log-retention.js';
import { connect, SQUARE_WKT } from './db-helpers.js';
import { LOG_RETENTION_LOCK } from '../../src/logs/logs.constants.js';

/**
 * Saklama işi: çıkışı saklama süresinden eski kapanmış kayıtlar silinir; açık girişler ve
 * yeni kayıtlar kalır. Aynı anda tek iş çalışır.
 */
describe('Giriş kayıtlarının saklama işi', () => {
  let ds: DataSource;
  let areaId: string;

  /** Giriş ve çıkış, şimdiden kaç gün önce (çıkış null: açık giriş). */
  const visit = (
    userId: string,
    entryDaysAgo: number,
    exitDaysAgo: number | null,
  ) =>
    ds.query(
      `INSERT INTO area_logs (user_id, area_id, entry_time, exit_time)
       VALUES ($1, $2, now() - make_interval(days => $3),
               CASE WHEN $4::int IS NULL THEN NULL ELSE now() - make_interval(days => $4::int) END)`,
      [userId, areaId, entryDaysAgo, exitDaysAgo],
    );
  const remaining = async () =>
    (await ds.query(`SELECT user_id FROM area_logs ORDER BY user_id`)).map(
      (r: { user_id: string }) => r.user_id,
    );

  beforeAll(async () => {
    ds = await connect();
  });
  beforeEach(async () => {
    await ds.query(
      'TRUNCATE area_logs, user_last_location, areas, rentals, riders RESTART IDENTITY CASCADE',
    );
    [{ id: areaId }] = await ds.query(
      `INSERT INTO areas (name, type, geom) VALUES ('Saklama', 'PARKING', ST_GeomFromText($1, 4326))
       RETURNING id`,
      [SQUARE_WKT],
    );
  });
  afterAll(() => ds.destroy());

  it('sadece çıkışı süreden eski kapanmış kayıtları, küçük gruplarla siler', async () => {
    for (let i = 0; i < 5; i++) await visit(`eski-${i}`, 400, 399);
    await visit('acik-eski', 400, null);
    await visit('sinirda', 400, 10); // girişi eski, çıkışı yeni: kalır
    await visit('yeni', 5, 4);

    await expect(
      purgeClosedLogs(ds, { days: 365, batch: 2, pauseMs: 0 }),
    ).resolves.toBe(5);
    expect(await remaining()).toEqual(['acik-eski', 'sinirda', 'yeni']);
    // Silinecek bir şey kalmadı.
    await expect(
      purgeClosedLogs(ds, { days: 365, batch: 2, pauseMs: 0 }),
    ).resolves.toBe(0);
  });

  it('başka bir saklama işi sürerken tur atlanır', async () => {
    await visit('eski', 400, 399);
    const other = ds.createQueryRunner();
    await other.connect();
    try {
      await other.query('SELECT pg_advisory_lock($1)', [LOG_RETENTION_LOCK]);
      await expect(
        purgeClosedLogs(ds, { days: 365, batch: 10, pauseMs: 0 }),
      ).resolves.toBeNull();
      expect(await remaining()).toEqual(['eski']);
    } finally {
      await other.query('SELECT pg_advisory_unlock($1)', [LOG_RETENTION_LOCK]);
      await other.release();
    }
  });

  it('arama entry_time index’ini kullanır, tabloyu taramaz', async () => {
    const [row] = await ds.query(
      `EXPLAIN (FORMAT JSON) SELECT id FROM area_logs
        WHERE entry_time < now() - make_interval(days => 365)
          AND exit_time < now() - make_interval(days => 365)
        ORDER BY entry_time LIMIT 5000`,
    );
    expect(JSON.stringify(row['QUERY PLAN'])).toMatch(/area_logs_entry_idx/);
  });
});
