import type { DataSource } from 'typeorm';
import type { LocationLanes } from '../queue/location-lanes.js';
import { DependencyStatus } from './health-status.enum.js';
import type { Dependencies } from './health.types.js';
import { HEALTH_CHECK_TIMEOUT_MS } from '../config/limits.js';

/** Redis düşükken komutlar yeniden bağlanmayı bekler; sağlık kontrolü asılı kalmasın. */
export const withTimeout = <T>(
  promise: Promise<T>,
  ms = HEALTH_CHECK_TIMEOUT_MS,
): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);

/** Veritabanı ve Redis'e ulaşılıyor mu (readiness; API ve worker aynı kontrolü yapar). */
export async function checkDependencies(
  dataSource: DataSource,
  lanes: LocationLanes,
): Promise<Dependencies> {
  const [database, redis] = await Promise.all([
    withTimeout(dataSource.query('SELECT 1')).then(
      () => DependencyStatus.UP,
      () => DependencyStatus.DOWN,
    ),
    withTimeout(lanes.connection.ping()).then(
      () => DependencyStatus.UP,
      () => DependencyStatus.DOWN,
    ),
  ]);
  return { database, redis };
}

export const allUp = (deps: Dependencies): boolean =>
  Object.values(deps).every((s) => s === DependencyStatus.UP);
