import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';
import { Area } from '../areas/area.entity.js';
import { AreaLog } from '../logs/area-log.entity.js';
import { UserLastLocation } from '../geofence/user-last-location.entity.js';
import { Init1727000000000 } from './migrations/1727000000000-Init.js';
import { OpenVisitIndexAndHotUpdates1727100000000 } from './migrations/1727100000000-OpenVisitIndexAndHotUpdates.js';
import { AreaLogsAutovacuum1727200000000 } from './migrations/1727200000000-AreaLogsAutovacuum.js';
import { QueryStats1727300000000 } from './migrations/1727300000000-QueryStats.js';

export const ENTITIES = [Area, AreaLog, UserLastLocation];
export const MIGRATIONS = [
  Init1727000000000,
  OpenVisitIndexAndHotUpdates1727100000000,
  AreaLogsAutovacuum1727200000000,
  QueryStats1727300000000,
];

export function typeOrmOptions(config: AppConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.db.host,
    port: config.db.port,
    username: config.db.user,
    password: config.db.password,
    database: config.db.name,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    // Şema sadece migration'larla yönetilir: TypeORM açılışta eklenti de kurmasın (her
    // initialize'da CREATE EXTENSION çalıştırıp kullanılmayan uuid-ossp'yi ekliyordu).
    // postgis ve pgcrypto Init migration'ında; uuid'ler gen_random_uuid() ile.
    synchronize: false,
    installExtensions: false,
    uuidExtension: 'pgcrypto',
    extra: {
      max: config.db.poolSize,
      idleTimeoutMillis: 30_000,
      // Oturum ayarları her bağlantı açılırken uygulanır.
      options: [
        `-c statement_timeout=${config.db.statementTimeoutMs}`,
        `-c idle_in_transaction_session_timeout=${config.db.idleInTransactionTimeoutMs}`,
      ].join(' '),
    },
  };
}
