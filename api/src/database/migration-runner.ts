import type { DataSource } from 'typeorm';

/**
 * Son migration'ı geri alır. TypeORM geri alırken migration'daki `transaction = false`
 * işaretini dikkate almaz; CREATE/DROP INDEX CONCURRENTLY transaction içinde çalışamadığı
 * için böyle bir migration transaction'sız geri alınır, diğerleri kendi transaction'ında.
 */
export async function revertLastMigration(
  dataSource: DataSource,
): Promise<string | null> {
  const [last]: Array<{ name: string }> = await dataSource.query(
    `SELECT name FROM migrations ORDER BY timestamp DESC, id DESC LIMIT 1`,
  );
  if (!last) return null;
  const migration = dataSource.migrations.find((m) => m.name === last.name);
  const outsideTransaction =
    (migration as { transaction?: boolean } | undefined)?.transaction === false;
  await dataSource.undoLastMigration({
    transaction: outsideTransaction ? 'none' : 'each',
  });
  return last.name;
}
