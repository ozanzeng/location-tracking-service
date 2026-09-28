import type { DataSource } from 'typeorm';
import { connect, expectPgError, SQUARE_WKT } from './db-helpers.js';

/**
 * Veritabanının kendi kuralları: uygulama katmanı hata yapsa bile tutarsız veri yazılamamalı.
 * Postgres hata kodları: 23514 check, 23505 unique, 22P02 geçersiz enum, 22023 geometri tipi.
 */
describe('Şema kısıtları', () => {
  let ds: DataSource;
  let areaId: string;

  const insertArea = (wkt: string, type = 'NO_RIDE') =>
    ds.query(
      `INSERT INTO areas (name, type, geom) VALUES ('t', $1, ST_GeomFromText($2, 4326)) RETURNING id`,
      [type, wkt],
    );
  const insertVisit = (
    userId: string,
    entry: string,
    exit: string | null = null,
  ) =>
    ds.query(
      `INSERT INTO area_logs (user_id, area_id, entry_time, exit_time) VALUES ($1, $2, $3, $4)`,
      [userId, areaId, entry, exit],
    );

  beforeAll(async () => {
    ds = await connect();
  });
  beforeEach(async () => {
    await ds.query(
      'TRUNCATE area_logs, user_last_location, areas RESTART IDENTITY CASCADE',
    );
    [{ id: areaId }] = await insertArea(SQUARE_WKT);
  });
  afterAll(() => ds.destroy());

  it('kendini kesen poligon reddedilir (ST_IsValid kontrolü)', async () => {
    await expectPgError(
      insertArea('POLYGON((0 0, 1 1, 1 0, 0 1, 0 0))'),
      '23514',
    );
  });

  it('Polygon dışındaki geometri tipi reddedilir', async () => {
    await expectPgError(
      insertArea('MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)))'),
      '22023',
    );
  });

  it('bilinmeyen alan tipi reddedilir', async () => {
    await expectPgError(insertArea(SQUARE_WKT, 'LAVA'), '22P02');
  });

  it('çıkış girişten önce olamaz', async () => {
    await expectPgError(
      insertVisit('u1', '2026-01-01T10:00:00Z', '2026-01-01T09:59:59Z'),
      '23514',
    );
  });

  it('"sinyal kesildi" işaretli giriş kapanmış olmalı (çıkış zamanı boş olamaz)', async () => {
    await expectPgError(
      ds.query(
        `INSERT INTO area_logs (user_id, area_id, entry_time, signal_lost) VALUES ('u', $1, now(), true)`,
        [areaId],
      ),
      '23514',
    );
  });

  it('aynı kullanıcının aynı alanda iki açık girişi olamaz', async () => {
    await insertVisit('u1', '2026-01-01T10:00:00Z');
    await expectPgError(insertVisit('u1', '2026-01-01T10:05:00Z'), '23505');
  });

  it('kapanmış girişler tekrarlanabilir; kapanmış + açık bir arada olabilir', async () => {
    await insertVisit('u1', '2026-01-01T09:00:00Z', '2026-01-01T09:10:00Z');
    await insertVisit('u1', '2026-01-01T09:20:00Z', '2026-01-01T09:30:00Z');
    await insertVisit('u1', '2026-01-01T10:00:00Z');
    await insertVisit('u2', '2026-01-01T10:00:00Z');
    const [{ count }] = await ds.query(
      `SELECT count(*)::int AS count FROM area_logs`,
    );
    expect(count).toBe(4);
  });

  it('alan silinince giriş kayıtları da silinir', async () => {
    await insertVisit('u1', '2026-01-01T10:00:00Z');
    await ds.query(`DELETE FROM areas WHERE id = $1`, [areaId]);
    const [{ count }] = await ds.query(
      `SELECT count(*)::int AS count FROM area_logs`,
    );
    expect(count).toBe(0);
  });

  it('var olmayan alana giriş yazılamaz', async () => {
    await expectPgError(
      ds.query(
        `INSERT INTO area_logs (user_id, area_id, entry_time) VALUES ('u1', gen_random_uuid(), now())`,
      ),
      '23503',
    );
  });
});
