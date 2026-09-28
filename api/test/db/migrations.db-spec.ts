import { DataSource, type DataSourceOptions } from 'typeorm';
import { type AppConfig, loadConfig } from '../../src/config/configuration.js';
import { revertLastMigration } from '../../src/database/migration-runner.js';
import { OpenVisitIndexAndHotUpdates1727100000000 } from '../../src/database/migrations/1727100000000-OpenVisitIndexAndHotUpdates.js';
import {
  migrationOptions,
  MIGRATIONS,
  typeOrmOptions,
} from '../../src/database/typeorm-options.js';
import { expectPgError } from './db-helpers.js';

const FRESH = 'geofence_migration_test';

/** Boş bir veritabanında migration'ların ileri ve geri çalıştığını doğrular. */
describe('Migration’lar (boş veritabanı)', () => {
  let admin: DataSource;
  let ds: DataSource;
  let base: AppConfig;

  const tables = async () =>
    (
      await ds.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name IN ('areas', 'area_logs', 'user_last_location')
          ORDER BY 1`,
      )
    ).map((r: { table_name: string }) => r.table_name);

  beforeAll(async () => {
    base = loadConfig();
    admin = await new DataSource({
      ...typeOrmOptions(base),
      database: 'postgres',
      migrations: [],
    } as DataSourceOptions).initialize();
    await admin.query(`DROP DATABASE IF EXISTS ${FRESH}`);
    await admin.query(`CREATE DATABASE ${FRESH}`);
    // Migrate betiğiyle aynı bağlantı ayarları.
    ds = await new DataSource(
      migrationOptions({ ...base, db: { ...base.db, name: FRESH } }),
    ).initialize();
  });

  afterAll(async () => {
    await ds?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS ${FRESH}`);
    await admin?.destroy();
  });

  it('hepsi sırayla uygulanır ve bekleyen migration kalmaz', async () => {
    const applied = await ds.runMigrations({ transaction: 'each' });
    expect(applied.map((m) => m.name)).toEqual(
      MIGRATIONS.map((M) => new M().name),
    );
    expect(await ds.showMigrations()).toBe(false);
    expect(await tables()).toEqual([
      'area_logs',
      'areas',
      'user_last_location',
    ]);
    // Eklentileri sadece migration kurar; TypeORM açılışta kendi eklentisini eklemez.
    const extensions = await ds.query(
      `SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY 1`,
    );
    expect(extensions.map((e: { extname: string }) => e.extname)).toEqual([
      'pg_stat_statements',
      'pgcrypto',
      'postgis',
    ]);
  });

  it('migration bağlantısı: sorgu süresi sınırsız, kilit beklemesi sınırlı (5 sn)', async () => {
    const [{ statement_timeout }] = await ds.query('SHOW statement_timeout');
    const [{ lock_timeout }] = await ds.query('SHOW lock_timeout');
    expect({ statement_timeout, lock_timeout }).toEqual({
      statement_timeout: '0',
      lock_timeout: '5s',
    });
  });

  it('kilitli tabloda migration süresiz beklemez, transaction dışında da', async () => {
    // Tabloyu uzun bir işlem tutuyor (ör. VACUUM, açık transaction).
    const holder = ds.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.query('LOCK TABLE areas IN ACCESS EXCLUSIVE MODE');
    const short = await new DataSource(
      migrationOptions({
        ...base,
        db: { ...base.db, name: FRESH, migrationLockTimeoutMs: 300 },
      }),
    ).initialize();
    try {
      const started = Date.now();
      // 55P03: lock_not_available. Transaction'sız (CONCURRENTLY gibi) çalıştırılır: SET LOCAL
      // burada etkisiz kalırdı.
      await expectPgError(
        short.query('ALTER TABLE areas SET (fillfactor = 90)'),
        '55P03',
      );
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      await holder.rollbackTransaction();
      await holder.release();
      await short.destroy();
    }
  });

  it('hepsi geri alınabilir (down) ve şema tamamen kalkar', async () => {
    // npm run migration:revert ile aynı yol (CONCURRENTLY index'li migration transaction dışında geri alınır).
    for (let i = 0; i < MIGRATIONS.length; i++) await revertLastMigration(ds);
    expect(await tables()).toEqual([]);
    const [{ count }] = await ds.query(
      `SELECT count(*)::int AS count FROM migrations`,
    );
    expect(count).toBe(0);
  });

  it('geri alındıktan sonra tekrar uygulanabilir', async () => {
    await ds.runMigrations({ transaction: 'each' });
    expect(await ds.showMigrations()).toBe(false);
    expect(await tables()).toHaveLength(3);
  });

  it('yarıda kalmış (INVALID) index tekrar çalıştırmada yeniden oluşturulur', async () => {
    const valid = async () =>
      (
        await ds.query(
          `SELECT i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
            WHERE c.relname = 'area_logs_open_entry_idx'`,
        )
      ).map((r: { valid: boolean }) => r.valid);

    // Index'i ekleyen migration'a kadar (o dahil) geri al; sonraki migration'lar da geri alınır.
    const indexMigration = MIGRATIONS.indexOf(
      OpenVisitIndexAndHotUpdates1727100000000,
    );
    for (let i = indexMigration; i < MIGRATIONS.length; i++)
      await revertLastMigration(ds);
    expect(await valid()).toEqual([]);

    // Gerçek bir yarıda kalmış build: tekrarlanan veride UNIQUE CONCURRENTLY başarısız olur
    // ve aynı adla INVALID bir index bırakır.
    const [{ id }] = await ds.query(
      `INSERT INTO areas (name, type, geom)
       VALUES ('x', 'PARKING', ST_GeomFromText('POLYGON((0 0, 1 0, 1 1, 0 0))', 4326))
       RETURNING id`,
    );
    await ds.query(
      `INSERT INTO area_logs (user_id, area_id, entry_time, exit_time)
       VALUES ('u', $1, now(), now()), ('u', $1, now(), now())`,
      [id],
    );
    await expect(
      ds.query(
        `CREATE UNIQUE INDEX CONCURRENTLY area_logs_open_entry_idx ON area_logs (user_id)`,
      ),
    ).rejects.toThrow();
    expect(await valid()).toEqual([false]);

    await ds.runMigrations({ transaction: 'each' });
    expect(await valid()).toEqual([true]);
  });
});
