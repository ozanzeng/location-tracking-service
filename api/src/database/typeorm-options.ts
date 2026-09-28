import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';
import { Area } from '../areas/area.entity.js';
import { AreaLog } from '../logs/area-log.entity.js';
import { UserLastLocation } from '../geofence/user-last-location.entity.js';
import { Rental } from '../fleet/rental.entity.js';
import { Scooter } from '../fleet/scooter.entity.js';
import { Rider } from '../riders/rider.entity.js';
import { Init1727000000000 } from './migrations/1727000000000-Init.js';
import { OpenVisitIndexAndHotUpdates1727100000000 } from './migrations/1727100000000-OpenVisitIndexAndHotUpdates.js';
import { AreaLogsAutovacuum1727200000000 } from './migrations/1727200000000-AreaLogsAutovacuum.js';
import { QueryStats1727300000000 } from './migrations/1727300000000-QueryStats.js';
import { SignalLoss1727400000000 } from './migrations/1727400000000-SignalLoss.js';
import { FleetAndRiders1727500000000 } from './migrations/1727500000000-FleetAndRiders.js';
import { AreaEdits1727600000000 } from './migrations/1727600000000-AreaEdits.js';
import { RentalHistoryIndex1727700000000 } from './migrations/1727700000000-RentalHistoryIndex.js';
import { UnifyExitReason1727800000000 } from './migrations/1727800000000-UnifyExitReason.js';

export const ENTITIES = [
  Area,
  AreaLog,
  UserLastLocation,
  Scooter,
  Rider,
  Rental,
];
export const MIGRATIONS = [
  Init1727000000000,
  OpenVisitIndexAndHotUpdates1727100000000,
  AreaLogsAutovacuum1727200000000,
  QueryStats1727300000000,
  SignalLoss1727400000000,
  FleetAndRiders1727500000000,
  AreaEdits1727600000000,
  RentalHistoryIndex1727700000000,
  UnifyExitReason1727800000000,
];

/**
 * `lockTimeoutMs`: kilit bekleme sınırı; uygulama bağlantılarında kapalı (0), migration'larda
 * açık (bkz. migrationOptions).
 */
export function typeOrmOptions(
  config: AppConfig,
  lockTimeoutMs = 0,
): DataSourceOptions {
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
        `-c lock_timeout=${lockTimeoutMs}`,
      ].join(' '),
    },
  };
}

/**
 * Migration bağlantısı. Sorgu süresi sınırı yok: büyük tabloda index oluşturmak uzun sürebilir.
 * Kilit beklemesi ise sınırlı: tabloda uzun süren bir işlem (ör. VACUUM, uzun transaction)
 * varsa deploy süresiz beklemez, hata verip durur ve tekrar denenebilir. Postgres'te kilit
 * bekleyen bir ALTER TABLE arkasına gelen sorguları da bekletir. Bağlantı düzeyinde olduğu için
 * transaction'lı ya da transaction'sız (CONCURRENTLY), ileri ya da geri her migration'a uygulanır.
 */
export function migrationOptions(config: AppConfig): DataSourceOptions {
  return typeOrmOptions(
    { ...config, db: { ...config.db, statementTimeoutMs: 0 } },
    config.db.migrationLockTimeoutMs,
  );
}
