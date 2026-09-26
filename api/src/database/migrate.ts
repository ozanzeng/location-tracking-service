import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/configuration.js';
import { loadEnvFile } from '../config/load-env.js';
import { typeOrmOptions } from './typeorm-options.js';

loadEnvFile();

const direction = process.argv[2] === 'revert' ? 'revert' : 'run';
const dataSource = new DataSource(typeOrmOptions(loadConfig()));

await dataSource.initialize();
try {
  if (direction === 'revert') {
    await dataSource.undoLastMigration();
    console.log('Son migration geri alındı.');
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
