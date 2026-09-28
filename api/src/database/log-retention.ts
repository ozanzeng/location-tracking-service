import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfigOrExit } from '../config/configuration.js';
import {
  LOG_RETENTION_BATCH,
  LOG_RETENTION_PAUSE_MS,
} from '../config/limits.js';
import { loadEnvFile } from '../config/load-env.js';
import { purgeClosedLogs } from '../logs/log-retention.js';
import { migrationOptions } from './typeorm-options.js';

/**
 * Giriş kayıtlarının saklama işi (bkz. logs/log-retention.ts). Şema sahibiyle bağlanır.
 *   node dist/database/log-retention.js          tek tur (Kubernetes CronJob)
 *   node dist/database/log-retention.js --loop   LOG_RETENTION_INTERVAL_MS'te bir (docker-compose)
 */
loadEnvFile();
const config = loadConfigOrExit();
const { logDays, intervalMs } = config.retention;
const loop = process.argv.includes('--loop');

async function runOnce(): Promise<void> {
  if (logDays === 0) {
    console.log('Saklama kapalı (LOG_RETENTION_DAYS=0).');
    return;
  }
  const dataSource = new DataSource(migrationOptions(config));
  await dataSource.initialize();
  try {
    const started = Date.now();
    const deleted = await purgeClosedLogs(dataSource, {
      days: logDays,
      batch: LOG_RETENTION_BATCH,
      pauseMs: LOG_RETENTION_PAUSE_MS,
    });
    console.log(
      deleted === null
        ? 'Başka bir saklama işi sürüyor; bu tur atlandı.'
        : `Çıkışı ${logDays} günden eski ${deleted} giriş kaydı silindi (${Date.now() - started} ms).`,
    );
  } finally {
    await dataSource.destroy();
  }
}

if (!loop) {
  await runOnce();
} else {
  // Veritabanı geçici olarak erişilemezse iş düşmez, sonraki turda tekrar dener.
  const tick = () =>
    runOnce().catch((err: Error) =>
      console.error(`Saklama turu başarısız: ${err.message}`),
    );
  await tick();
  const timer = setInterval(() => void tick(), intervalMs);
  process.once('SIGTERM', () => clearInterval(timer));
}
