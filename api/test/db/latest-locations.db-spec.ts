import type { DataSource } from 'typeorm';
import { LatestLocationsService } from '../../src/locations/latest-locations.service.js';
import { connect, SQUARE_WKT } from './db-helpers.js';

/** GET /locations/latest: canlı haritanın ilk yüklemesi (son konumlar + içinde olunan alanlar). */
describe('Son konumlar sorgusu', () => {
  let ds: DataSource;
  let latest: LatestLocationsService;

  beforeAll(async () => {
    ds = await connect();
    latest = new LatestLocationsService(ds);
    await ds.query(
      'TRUNCATE area_logs, user_last_location, areas RESTART IDENTITY CASCADE',
    );
    await ds.query(
      `INSERT INTO areas (name, type, geom)
       VALUES ('Park', 'PARKING', ST_GeomFromText($1, 4326)),
              ('Yavaş', 'SLOW', ST_GeomFromText($1, 4326)),
              ('Eski', 'NO_RIDE', ST_GeomFromText($1, 4326))`,
      [SQUARE_WKT],
    );
    // b ve c aynı saniyede; d pencerenin dışında.
    await ds.query(`
      INSERT INTO user_last_location (user_id, lat, lng, recorded_at) VALUES
        ('a', 40.1, 29.1, now() - interval '10 seconds'),
        ('c', 40.3, 29.3, date_trunc('second', now()) - interval '20 seconds'),
        ('b', 40.2, 29.2, date_trunc('second', now()) - interval '20 seconds'),
        ('d', 40.4, 29.4, now() - interval '2 hours')`);
    // a iki alanın içinde; b'nin tek girişi kapanmış; d içeride ama pencere dışında.
    await ds.query(`
      INSERT INTO area_logs (user_id, area_id, entry_time, exit_time)
      SELECT u, (SELECT id FROM areas WHERE name = n), now() - interval '1 minute', x
        FROM (VALUES ('a', 'Park', NULL::timestamptz),
                     ('a', 'Yavaş', NULL),
                     ('b', 'Eski', now()),
                     ('d', 'Park', NULL)) v(u, n, x)`);
  });

  afterAll(async () => {
    await ds.query(
      'TRUNCATE area_logs, user_last_location, areas RESTART IDENTITY CASCADE',
    );
    await ds.destroy();
  });

  it('pencere içindeki kullanıcılar, en yeniden eskiye; aynı saniyedekiler kimliğe göre', async () => {
    const rows = await latest.find(30, 10);
    expect(rows.map((r) => r.userId)).toEqual(['a', 'b', 'c']);
    expect(rows[0]).toMatchObject({ lat: 40.1, lng: 29.1 });
    expect(Date.parse(rows[0].recordedAt)).not.toBeNaN();
  });

  it('içinde bulunulan alanları ekler; kapanmış giriş sayılmaz, alanı olmayana boş liste', async () => {
    const rows = await latest.find(30, 10);
    const byUser = Object.fromEntries(rows.map((r) => [r.userId, r.areas]));
    expect(byUser.a.map((a) => a.name).sort()).toEqual(['Park', 'Yavaş']);
    expect(byUser.a[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      type: expect.any(String),
    });
    expect(byUser.b).toEqual([]);
    expect(byUser.c).toEqual([]);
  });

  it('limit en yeni kullanıcıları bırakır; sınırdaki eşitlikte sonuç her seferinde aynı', async () => {
    expect((await latest.find(30, 2)).map((r) => r.userId)).toEqual(['a', 'b']);
    // Uzun pencere pencere dışındaki kullanıcıyı da alır.
    expect((await latest.find(180, 10)).map((r) => r.userId)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });
});
