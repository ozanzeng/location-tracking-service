import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfigOrExit } from '../config/configuration.js';
import { loadEnvFile } from '../config/load-env.js';
import { revertLastMigration } from './migration-runner.js';
import { typeOrmOptions } from './typeorm-options.js';

loadEnvFile();

const direction = process.argv[2] === 'revert' ? 'revert' : 'run';
const dataSource = new DataSource(
  typeOrmOptions(
    // Migration'larda sorgu süresi sınırı yok: büyük tabloda index oluşturmak uzun sürebilir.
    (({ db, ...rest }) => ({ ...rest, db: { ...db, statementTimeoutMs: 0 } }))(
      loadConfigOrExit(),
    ),
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
  }
} finally {
  await dataSource.destroy();
}
