import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import {
  APP_CONFIG,
  type AppConfig,
  loadConfig,
} from '../src/config/configuration.js';
import { LOCATION_QUEUE } from '../src/queue/location-job.js';
import { setupApp } from '../src/setup-app.js';
import { WorkerModule } from '../src/worker.module.js';

interface TestAppOptions {
  /** Varsayılan config'in üzerine yazılacak değerler. */
  config?: (base: AppConfig) => AppConfig;
  /** false: sadece API; kuyruk işlenmez (backpressure testi için). */
  withWorker?: boolean;
}

/** API ve worker'ı aynı süreçte ayağa kaldırır; gerçek PostGIS + Redis kullanır. */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication> {
  const base = loadConfig();
  const moduleRef = await Test.createTestingModule({
    imports:
      options.withWorker === false ? [AppModule] : [AppModule, WorkerModule],
  })
    .overrideProvider(APP_CONFIG)
    .useValue(options.config ? options.config(base) : base)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  setupApp(app);
  await app.listen(0);
  return app;
}

export async function resetState(app: INestApplication): Promise<void> {
  const queue = app.get<Queue>(getQueueToken(LOCATION_QUEUE));
  await queue.drain(true);
  // Boşaltılan işlerin sıra no'ları hiç tamamlanmaz; kalırsa sonraki testin işleri bekler.
  const config = app.get<AppConfig>(APP_CONFIG);
  const redis = new Redis(config.redisUrl);
  try {
    const seqKeys = await redis.keys(`${config.queue.prefix}:seq:*`);
    if (seqKeys.length) await redis.del(...seqKeys);
  } finally {
    await redis.quit();
  }
  await app
    .get(DataSource)
    .query(
      'TRUNCATE area_logs, user_last_location, areas RESTART IDENTITY CASCADE',
    );
}

/** Kuyrukta bekleyen/işlenen iş kalmayana kadar bekler. */
export async function waitForQueueDrain(
  app: INestApplication,
  timeoutMs = 15_000,
): Promise<void> {
  const queue = app.get<Queue>(getQueueToken(LOCATION_QUEUE));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
    );
    if (Object.values(counts).every((n) => n === 0)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Kuyruk zamanında boşalmadı');
}

/** 29.02-29.03 boylam, 40.98-40.99 enlem arası kare. */
export const MODA_SQUARE = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [29.02, 40.98],
      [29.03, 40.98],
      [29.03, 40.99],
      [29.02, 40.99],
      [29.02, 40.98],
    ],
  ],
};

export const INSIDE = { lat: 40.985, lng: 29.025 };
export const OUTSIDE = { lat: 41.05, lng: 29.1 };
