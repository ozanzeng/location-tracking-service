import './e2e-env.js';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../src/config/configuration.js';
import { typeOrmOptions } from '../src/database/typeorm-options.js';

export default async function setup() {
  const dataSource = new DataSource(typeOrmOptions(loadConfig()));
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  await dataSource.destroy();
}
