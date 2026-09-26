import { DataSource, type DataSourceOptions } from 'typeorm';
import { loadConfig } from '../../src/config/configuration.js';
import { revertLastMigration } from '../../src/database/migration-runner.js';
import {
  MIGRATIONS,
  typeOrmOptions,
} from '../../src/database/typeorm-options.js';

const FRESH = 'geofence_migration_test';

/** Boş bir veritabanında migration'ların ileri ve geri çalıştığını doğrular. */
describe('Migration’lar (boş veritabanı)', () => {
  let admin: DataSource;
  let ds: DataSource;

  const tables = async () =>
    (
      await ds.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name IN ('areas', 'area_logs', 'user_last_location')
          ORDER BY 1`,
      )
    ).map((r: { table_name: string }) => r.table_name);

  beforeAll(async () => {
    const base = loadConfig();
    admin = await new DataSource({
      ...typeOrmOptions(base),
      database: 'postgres',
      migrations: [],
    } as DataSourceOptions).initialize();
    await admin.query(`DROP DATABASE IF EXISTS ${FRESH}`);
    await admin.query(`CREATE DATABASE ${FRESH}`);
    // Migration'lar gibi: sorgu süresi sınırı yok.
    ds = await new DataSource(
      typeOrmOptions({
        ...base,
        db: { ...base.db, name: FRESH, statementTimeoutMs: 0 },
      }),
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
});
