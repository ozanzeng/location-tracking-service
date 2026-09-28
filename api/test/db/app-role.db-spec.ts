import type { DataSource } from 'typeorm';
import { Area } from '../../src/areas/area.entity.js';
import { AreaType } from '../../src/areas/area-type.enum.js';
import { ensureAppRole } from '../../src/database/app-role.js';
import { scramSha256Verifier } from '../../src/database/scram.js';
import { GeofenceRepository } from '../../src/geofence/geofence.repository.js';
import { GeofenceService } from '../../src/geofence/geofence.service.js';
import { ProcessStatus } from '../../src/geofence/process-status.enum.js';
import { connect, expectPgError } from './db-helpers.js';

const ROLE = 'geofence_app_test';
const PASSWORD = 'uygulama-rolu-test';
/** 42501: insufficient_privilege */
const DENIED = '42501';

/**
 * API ve worker'ın bağlandığı en az yetkili rol: yaptıkları her işi yapabilmeli, fazlasını
 * yapamamalı. Uygulamanın gerçek yazma yolu (GeofenceService) bu rolle çalıştırılır.
 */
describe('Uygulama rolü (en az yetki)', () => {
  let owner: DataSource;
  let app: DataSource;

  /** pg_stat_statements'ta metni `text` içeren sorgular (istatistikler çalıştırmalar arasında kalır). */
  const statsContaining = (text: string) =>
    owner.query(
      `SELECT queryid FROM pg_stat_statements WHERE strpos(query, $1) > 0`,
      [text],
    );
  const forgetStats = (text: string) =>
    owner.query(
      `SELECT pg_stat_statements_reset(0, 0, queryid) FROM pg_stat_statements WHERE strpos(query, $1) > 0`,
      [text],
    );

  beforeAll(async () => {
    owner = await connect();
    await owner.query(
      'TRUNCATE area_logs, user_last_location, areas, rentals, riders RESTART IDENTITY CASCADE',
    );
    // Önceki (düzeltme öncesi) çalıştırmalardan kalmış kayıtlar sonucu etkilemesin.
    await forgetStats(PASSWORD);
    await ensureAppRole(owner, ROLE, PASSWORD);
    app = await connect((c) => ({
      ...c,
      db: { ...c.db, user: ROLE, password: PASSWORD },
    }));
  });
  afterAll(async () => {
    await app?.destroy();
    await owner.query(
      'TRUNCATE area_logs, user_last_location, areas, rentals, riders RESTART IDENTITY CASCADE',
    );
    await owner.query("DELETE FROM scooters WHERE id = 'rol-scooter'");
    await owner.destroy();
  });

  it("tekrar çalıştırılınca aynı sonucu verir (her migrate'te çağrılır)", async () => {
    await expect(ensureAppRole(owner, ROLE, PASSWORD)).resolves.toBe(
      'güncellendi',
    );
  });

  it('şifre sunucuya düz metin gitmez: pg_stat_statements ve loglar görmez', async () => {
    expect(await statsContaining(PASSWORD)).toEqual([]);
    const [{ verifier }] = await owner.query(
      `SELECT rolpassword AS verifier FROM pg_authid WHERE rolname = $1`,
      [ROLE],
    );
    expect(verifier).toMatch(/^SCRAM-SHA-256\$4096:/);
  });

  it("gönderilen doğrulayıcı Postgres'in şifreden ürettiğiyle aynı (Türkçe karakterli şifre dahil)", async () => {
    for (const [i, password] of [
      'ascii-Sifre-42',
      'şifre-ÇĞİÖŞÜ-ığ',
    ].entries()) {
      const probe = `scram_probe_${i}`;
      await owner.query(`DROP ROLE IF EXISTS ${probe}`);
      // Karşılaştırma için Postgres'e bir kez düz şifre verilir; kaydı hemen silinir.
      const literal = password.replaceAll("'", "''");
      await owner.query(`CREATE ROLE ${probe} PASSWORD '${literal}'`);
      await forgetStats(password);
      const [{ stored }] = await owner.query(
        `SELECT rolpassword AS stored FROM pg_authid WHERE rolname = $1`,
        [probe],
      );
      await owner.query(`DROP ROLE ${probe}`);
      const [, iterations, salt] = /^SCRAM-SHA-256\$(\d+):([^$]+)\$/.exec(
        stored,
      )!;
      expect(
        scramSha256Verifier(
          password,
          Buffer.from(salt, 'base64'),
          Number(iterations),
        ),
      ).toBe(stored);
    }
  });

  it('superuser değildir, rol ya da veritabanı oluşturamaz', async () => {
    const [role] = await app.query(
      'SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user',
    );
    expect(role).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });

  it("API ve worker'ın yaptıklarını yapar: alan oluşturma, giriş, çıkış, son konum", async () => {
    const area = await app.getRepository(Area).save(
      app.getRepository(Area).create({
        name: 'Rol testi',
        type: AreaType.PARKING,
        geom: {
          type: 'Polygon',
          coordinates: [
            [
              [29.02, 40.98],
              [29.03, 40.98],
              [29.03, 40.99],
              [29.02, 40.99],
              [29.02, 40.98],
            ],
          ],
        },
      }),
    );
    expect(area.id).toBeDefined();

    const geofence = new GeofenceService(app, new GeofenceRepository());
    const inside = await geofence.process({
      userId: 'rol-1',
      lat: 40.985,
      lng: 29.025,
      recordedAt: '2026-09-28T10:00:00.000Z',
    });
    const outside = await geofence.process({
      userId: 'rol-1',
      lat: 41.05,
      lng: 29.1,
      recordedAt: '2026-09-28T10:00:05.000Z',
    });
    expect(inside).toMatchObject({ status: ProcessStatus.PROCESSED });
    expect(outside).toMatchObject({ status: ProcessStatus.PROCESSED });

    const [log] = await app.query(
      'SELECT entry_time, exit_time FROM area_logs WHERE user_id = $1',
      ['rol-1'],
    );
    expect(log.exit_time).not.toBeNull();
  });

  it('filo, kiralama ve alan düzenlemeyi yapar: üyelik, kiralama (satır kilidiyle), bitirme, scooter ekleme ve yumuşak silme, sinyal kaybı', async () => {
    const [{ id: riderId }] = await app.query(
      `INSERT INTO riders (username, password_hash) VALUES ('rol-surucu', 'x') RETURNING id`,
    );
    await app.query(
      `INSERT INTO scooters (id, name) VALUES ('rol-scooter', 'Rol') ON CONFLICT (id) DO UPDATE SET deleted_at = NULL`,
    );
    await app.transaction(async (m) => {
      await m.query(
        `SELECT id FROM scooters WHERE id = 'rol-scooter' AND deleted_at IS NULL FOR SHARE`,
      );
      await m.query(
        `INSERT INTO rentals (scooter_id, rider_id) VALUES ('rol-scooter', $1)`,
        [riderId],
      );
    });
    await app.query(
      `UPDATE rentals SET ended_at = now(), end_reason = 'RETURNED' WHERE rider_id = $1 AND ended_at IS NULL`,
      [riderId],
    );
    await app.transaction(async (m) => {
      await m.query(
        `SELECT id FROM scooters WHERE id = 'rol-scooter' FOR UPDATE`,
      );
      await m.query(
        `UPDATE scooters SET deleted_at = now() WHERE id = 'rol-scooter'`,
      );
    });
    await app.query(
      `UPDATE area_logs SET exit_reason = 'SIGNAL_LOST' WHERE false`,
    );
    // Alan düzenleme ve yumuşak silme.
    await app.query(
      `UPDATE areas SET name = name, deleted_at = NULL WHERE false`,
    );
    // Girişte eski özet yenilenir: sadece şifre kolonu güncellenebilir.
    await app.query(`UPDATE riders SET password_hash = 'yeni' WHERE id = $1`, [
      riderId,
    ]);
  });

  it.each([
    ['alan silme', 'DELETE FROM areas'],
    ['scooter silme (sadece yumuşak silme var)', 'DELETE FROM scooters'],
    ['kiralama geçmişi silme', 'DELETE FROM rentals'],
    ['sürücü hesabı silme', 'DELETE FROM riders'],
    ['sürücü kullanıcı adı değiştirme', "UPDATE riders SET username = 'x'"],
    ['log silme', 'DELETE FROM area_logs'],
    ['tablo boşaltma', 'TRUNCATE area_logs'],
    ['tablo oluşturma', 'CREATE TABLE sizinti (id int)'],
    ['sunucuda komut çalıştırma', "COPY areas TO PROGRAM 'true'"],
  ])('%s yetkisi yok', async (_label, sql) => {
    await expectPgError(app.query(sql), DENIED);
  });
});
