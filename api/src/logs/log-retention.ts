import type { DataSource } from 'typeorm';
import type { RetentionOptions } from './logs.types.js';
import { LOG_RETENTION_LOCK } from './logs.constants.js';

/**
 * Çıkışı `days` günden eski giriş kayıtlarını küçük gruplarla siler; silinen kayıt sayısını,
 * başka bir saklama işi sürüyorsa null döner. Açık girişler (exit_time boş) ne kadar eski
 * olursa olsun kalır: scooter hâlâ alanın içindedir.
 *
 * Yetki: uygulama rolü area_logs'tan silemez (kayıtlar denetim izi; app-role.ts). Bu iş şema
 * sahibi bağlantısıyla, API ve worker'dan ayrı çalışır (docker-compose'da log-retention,
 * Kubernetes'te CronJob).
 *
 * Arama entry_time index'ini kullanır: exit_time >= entry_time olduğu için çıkışı eski olan
 * kaydın girişi de eskidir.
 */
export async function purgeClosedLogs(
  ds: DataSource,
  { days, batch, pauseMs }: RetentionOptions,
): Promise<number | null> {
  const runner = ds.createQueryRunner();
  await runner.connect();
  try {
    const [{ locked }]: Array<{ locked: boolean }> = await runner.query(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [LOG_RETENTION_LOCK],
    );
    if (!locked) return null;
    try {
      let total = 0;
      for (;;) {
        const [, deleted]: [unknown, number] = await runner.query(
          `DELETE FROM area_logs WHERE id IN (
             SELECT id FROM area_logs
              WHERE entry_time < now() - make_interval(days => $1)
                AND exit_time < now() - make_interval(days => $1)
              ORDER BY entry_time
              LIMIT $2)`,
          [days, batch],
        );
        total += deleted;
        if (deleted < batch) return total;
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
      }
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1)', [LOG_RETENTION_LOCK]);
    }
  } finally {
    await runner.release();
  }
}
