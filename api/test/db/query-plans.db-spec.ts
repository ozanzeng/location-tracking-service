import type { DataSource } from 'typeorm';
import {
  connect,
  expectPgError,
  indexesUsed,
  SQUARE_WKT,
} from './db-helpers.js';

/**
 * Sorgu planı regresyon testleri: kritik sorgular beklenen index'i kullanmaya devam etmeli.
 * Planlayıcı küçük tablolarda index'i atlayabildiği için gerçekçi hacimde veri üretilir.
 */
describe('Sorgu planları ve performans ayarları', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await connect();
    await ds.query(
      'TRUNCATE area_logs, user_last_location, areas RESTART IDENTITY CASCADE',
    );
    await ds.query(
      `INSERT INTO areas (name, type, geom) SELECT 'a' || i, 'NO_RIDE', ST_GeomFromText($1, 4326)
                      FROM generate_series(1, 10) i`,
      [SQUARE_WKT],
    );
    // 200 bin kapanmış giriş (5 bin kullanıcı, 180 gün) + 2 bin açık giriş
    await ds.query(`
      WITH ids AS (SELECT array_agg(id) AS a FROM areas)
      INSERT INTO area_logs (user_id, area_id, entry_time, exit_time)
      SELECT 'u' || (i % 5000), (SELECT a[1 + i % 10] FROM ids), t, t + interval '10 minutes'
        FROM (SELECT i, now() - (i % 259200) * interval '1 minute' AS t FROM generate_series(1, 200000) i) s`);
    await ds.query(`
      WITH ids AS (SELECT array_agg(id) AS a FROM areas)
      INSERT INTO area_logs (user_id, area_id, entry_time)
      SELECT 'u' || i, (SELECT a[1 + i % 10] FROM ids), now() - i * interval '1 second'
        FROM generate_series(1, 2000) i`);
    await ds.query(`INSERT INTO user_last_location (user_id, lat, lng, recorded_at)
                    SELECT 'u' || i, 40.985, 29.025, now() FROM generate_series(1, 5000) i`);
    await ds.query('ANALYZE');
  });

  afterAll(async () => {
    await ds.query(
      'TRUNCATE area_logs, user_last_location, areas RESTART IDENTITY CASCADE',
    );
    await ds.destroy();
  });

  const logsQuery = (where: string) =>
    `SELECT l.id FROM area_logs l ${where} ORDER BY l.entry_time DESC, l.id DESC LIMIT 51`;

  it('GET /logs filtresiz: zaman index’i', async () => {
    expect(await indexesUsed(ds, logsQuery(''))).toContain(
      'area_logs_entry_idx',
    );
  });

  it('GET /logs?userId: kullanıcı index’i', async () => {
    expect(
      await indexesUsed(ds, logsQuery(`WHERE l.user_id = 'u42'`)),
    ).toContain('area_logs_user_idx');
  });

  it('GET /logs?areaId + zaman aralığı: alan index’i', async () => {
    const sql = logsQuery(
      `WHERE l.area_id = (SELECT id FROM areas WHERE name = 'a3') AND l.entry_time >= now() - interval '2 days'`,
    );
    expect(await indexesUsed(ds, sql)).toContain('area_logs_area_idx');
  });

  it('GET /logs?active=true derin sayfa: açık girişler index’i (tüm tabloyu taramaz)', async () => {
    const sql = logsQuery(
      `WHERE l.exit_time IS NULL AND (l.entry_time, l.id) < (now() - interval '1 day', 1)`,
    );
    expect(await indexesUsed(ds, sql)).toContain('area_logs_open_entry_idx');
  });

  it('worker: kullanıcının açık girişleri tekil açık giriş index’inden okunur', async () => {
    const sql = `SELECT area_id FROM area_logs WHERE user_id = 'u7' AND exit_time IS NULL`;
    expect(await indexesUsed(ds, sql)).toContain('area_logs_open_visit_uq');
  });

  it('user_last_location HOT güncellenir (recorded_at index’i yok, fillfactor 70)', async () => {
    const [{ reloptions }] = await ds.query(
      `SELECT reloptions FROM pg_class WHERE relname = 'user_last_location'`,
    );
    expect(reloptions).toContain('fillfactor=70');
    const indexes = await ds.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'user_last_location'`,
    );
    expect(indexes.map((i: { indexname: string }) => i.indexname)).toEqual([
      'user_last_location_pkey',
    ]);

    // Gerçek kullanım gibi: her konum tek bir kullanıcının satırını günceller, dağınık sırayla.
    await ds.query(
      `SELECT pg_stat_reset_single_table_counters('user_last_location'::regclass)`,
    );
    for (let round = 0; round < 5; round++) {
      await ds.query(`
        DO $$
        BEGIN
          FOR i IN 1..200 LOOP
            UPDATE user_last_location SET lat = lat + 0.00001, recorded_at = now()
             WHERE user_id = 'u' || (1 + floor(random() * 5000))::int;
          END LOOP;
        END $$`);
    }
    await ds.query(`SELECT pg_stat_force_next_flush()`);
    const [{ upd, hot }] = await ds.query(
      `SELECT n_tup_upd::int AS upd, n_tup_hot_upd::int AS hot FROM pg_stat_user_tables WHERE relname = 'user_last_location'`,
    );
    expect(upd).toBeGreaterThan(900);
    // Eski şemada (recorded_at index'i) bu oran %0'dı.
    expect(hot / upd).toBeGreaterThan(0.95);
  });

  it('statement_timeout uzun sorguyu keser', async () => {
    const short = await connect((c) => ({
      ...c,
      db: { ...c.db, statementTimeoutMs: 200 },
    }));
    try {
      await expectPgError(short.query('SELECT pg_sleep(2)'), '57014');
    } finally {
      await short.destroy();
    }
  });
});
