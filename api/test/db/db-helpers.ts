import 'reflect-metadata';
import { DataSource, QueryFailedError } from 'typeorm';
import { type AppConfig, loadConfig } from '../../src/config/configuration.js';
import { typeOrmOptions } from '../../src/database/typeorm-options.js';

export async function connect(
  override: (c: AppConfig) => AppConfig = (c) => c,
): Promise<DataSource> {
  const ds = new DataSource(typeOrmOptions(override(loadConfig())));
  return ds.initialize();
}

/** Sorgunun belirli bir Postgres hata koduyla reddedildiğini doğrular. */
export async function expectPgError(
  promise: Promise<unknown>,
  code: string,
): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(QueryFailedError);
    expect(
      (err as QueryFailedError & { driverError: { code: string } }).driverError
        .code,
    ).toBe(code);
    return (err as Error).message;
  }
  throw new Error(`Sorgu ${code} koduyla reddedilmeliydi ama başarılı oldu`);
}

/** EXPLAIN planında geçen index adları. */
export async function indexesUsed(
  ds: DataSource,
  sql: string,
  params: unknown[] = [],
): Promise<string[]> {
  const [row] = await ds.query(`EXPLAIN (FORMAT JSON) ${sql}`, params);
  const names: string[] = [];
  const walk = (node: Record<string, unknown>) => {
    if (typeof node['Index Name'] === 'string') names.push(node['Index Name']);
    for (const child of (node.Plans as Record<string, unknown>[] | undefined) ??
      [])
      walk(child);
  };
  walk(row['QUERY PLAN'][0].Plan);
  return names;
}

/** 29.02-29.03 boylam, 40.98-40.99 enlem arası kare (WKT). */
export const SQUARE_WKT =
  'POLYGON((29.02 40.98, 29.03 40.98, 29.03 40.99, 29.02 40.99, 29.02 40.98))';
