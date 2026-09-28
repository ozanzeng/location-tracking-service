import type { DataSource } from 'typeorm';
import { Area } from '../../src/areas/area.entity.js';
import { AreaType } from '../../src/areas/area-type.enum.js';
import { ensureAppRole } from '../../src/database/app-role.js';
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

  beforeAll(async () => {
    owner = await connect();
    await owner.query(
      'TRUNCATE area_logs, user_last_location, areas RESTART IDENTITY CASCADE',
    );
    await ensureAppRole(owner, ROLE, PASSWORD);
    app = await connect((c) => ({
      ...c,
      db: { ...c.db, user: ROLE, password: PASSWORD },
    }));
  });
  afterAll(async () => {
    await app?.destroy();
    await owner.query(
      'TRUNCATE area_logs, user_last_location, areas RESTART IDENTITY CASCADE',
    );
    await owner.destroy();
  });

  it("tekrar çalıştırılınca aynı sonucu verir (her migrate'te çağrılır)", async () => {
    await expect(ensureAppRole(owner, ROLE, PASSWORD)).resolves.toBe(
      'güncellendi',
    );
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

  it.each([
    ['alan silme', 'DELETE FROM areas'],
    ['log silme', 'DELETE FROM area_logs'],
    ['tablo boşaltma', 'TRUNCATE area_logs'],
    ['alan güncelleme', "UPDATE areas SET name = 'x'"],
    ['tablo oluşturma', 'CREATE TABLE sizinti (id int)'],
    ['sunucuda komut çalıştırma', "COPY areas TO PROGRAM 'true'"],
  ])('%s yetkisi yok', async (_label, sql) => {
    await expectPgError(app.query(sql), DENIED);
  });
});
