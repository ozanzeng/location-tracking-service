import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfigOrExit } from '../config/configuration.js';
import { loadEnvFile } from '../config/load-env.js';
import { ensureAppRole } from './app-role.js';
import { revertLastMigration } from './migration-runner.js';
import { typeOrmOptions } from './typeorm-options.js';

loadEnvFile();

const direction = process.argv[2] === 'revert' ? 'revert' : 'run';
const config = loadConfigOrExit();
const dataSource = new DataSource(
  typeOrmOptions(
    // Migration'larda sorgu süresi sınırı yok: büyük tabloda index oluşturmak uzun sürebilir.
    { ...config, db: { ...config.db, statementTimeoutMs: 0 } },
  ),
);

await dataSource.initialize();
try {
  if (direction === 'revert') {
    const name = await revertLastMigration(dataSource);
    console.log(name ? `Geri alındı: ${name}` : 'Geri alınacak migration yok.');
  } else {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    console.log(
      applied.length
        ? `Uygulanan migration'lar: ${applied.map((m) => m.name).join(', ')}`
        : 'Şema güncel.',
    );
    const { appUser, appPassword } = config.db;
    if (appUser && appPassword) {
      const result = await ensureAppRole(dataSource, appUser, appPassword);
      console.log(`Uygulama rolü ${appUser} ${result}.`);
    }
  }
} finally {
  await dataSource.destroy();
}
