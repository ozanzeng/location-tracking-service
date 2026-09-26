import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';
import { Area } from '../areas/area.entity.js';
import { AreaLog } from '../logs/area-log.entity.js';
import { UserLastLocation } from '../geofence/user-last-location.entity.js';
import { Init1727000000000 } from './migrations/1727000000000-Init.js';

export const ENTITIES = [Area, AreaLog, UserLastLocation];
export const MIGRATIONS = [Init1727000000000];

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
    },
  };
}
