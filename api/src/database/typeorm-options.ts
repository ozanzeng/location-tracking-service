import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';
import { Area } from '../areas/area.entity.js';
import { AreaLog } from '../logs/area-log.entity.js';
import { UserLastLocation } from '../geofence/user-last-location.entity.js';
import { Init1727000000000 } from './migrations/1727000000000-Init.js';
import { OpenVisitIndexAndHotUpdates1727100000000 } from './migrations/1727100000000-OpenVisitIndexAndHotUpdates.js';

export const ENTITIES = [Area, AreaLog, UserLastLocation];
export const MIGRATIONS = [
  Init1727000000000,
  OpenVisitIndexAndHotUpdates1727100000000,
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
    // Şema sadece migration'larla yönetilir.
    synchronize: false,
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
