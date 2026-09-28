import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import {
  APP_CONFIG,
  type AppConfig,
  loadConfig,
} from '../src/config/configuration.js';
import { ScooterRegistry } from '../src/fleet/scooter-registry.js';
import { DEFAULT_SCOOTERS } from '../src/database/migrations/1727500000000-FleetAndRiders.js';
import type { ExitReason } from '../src/logs/exit-reason.enum.js';
import { LocationLanes } from '../src/queue/location-lanes.js';
import { setupApp } from '../src/setup-app.js';
import { WorkerModule } from '../src/worker.module.js';

interface TestAppOptions {
  /** Varsayılan config'in üzerine yazılacak değerler. */
  config?: (base: AppConfig) => AppConfig;
  /** false: sadece API; kuyruk işlenmez (backpressure testi için). */
  withWorker?: boolean;
  /**
   * Konum senaryoları (giriş/çıkış, sıra, şeritler) scooter kaydından bağımsızdır ve her testte
   * yeni kimlik kullanır: varsayılan olarak her kimlik kayıtlı sayılır. Kayıt kuralını test
   * edenler 'registered' ile gerçek listeyi kullanır (fleet.e2e-spec.ts).
   */
  scooters?: 'any' | 'registered';
}

/** Her kimliği kayıtlı sayan liste (bkz. TestAppOptions.scooters). */
const ANY_SCOOTER: Pick<
  ScooterRegistry,
  'assertRegistered' | 'added' | 'removed' | 'refresh'
> = {
  assertRegistered: () => undefined,
  added: () => undefined,
  removed: () => undefined,
  refresh: async () => undefined,
};

/** API ve worker'ı aynı süreçte ayağa kaldırır; gerçek PostGIS + Redis kullanır. */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication> {
  const loaded = loadConfig();
  // Sinyal kaybı ve sessiz kiralama aramaları testlerde kapalı: 30 sn'den uzun süren bir
  // dosyada açık girişler ve kiralamalar kendiliğinden kapanmasın. Bu davranışları sınayan
  // testler kendi süresini verir.
  const base: AppConfig = {
    ...loaded,
    worker: {
      ...loaded.worker,
      signalLossTimeoutMs: 0,
      rentalIdleTimeoutMs: 0,
    },
  };
  let builder = Test.createTestingModule({
    imports:
      options.withWorker === false ? [AppModule] : [AppModule, WorkerModule],
  })
    .overrideProvider(APP_CONFIG)
    .useValue(options.config ? options.config(base) : base);
  if (options.scooters !== 'registered') {
    builder = builder.overrideProvider(ScooterRegistry).useValue(ANY_SCOOTER);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({
    logger: ['error', 'warn'],
    return503OnClosing: true,
  });
  setupApp(app);
  await app.listen(0);
  return app;
}

export async function resetState(app: INestApplication): Promise<void> {
  await Promise.all(
    app
      .get(LocationLanes)
      .queues()
      .map((queue) => queue.drain(true)),
  );
  const db = app.get(DataSource);
  await db.query(
    'TRUNCATE area_logs, user_last_location, areas, rentals, riders RESTART IDENTITY CASCADE',
  );
  // Filo kurulumdaki haline döner: varsayılan 5 scooter, silinmemiş.
  await db.query('DELETE FROM scooters WHERE NOT (id = ANY($1))', [
    DEFAULT_SCOOTERS.map((s) => s.id),
  ]);
  await db.query(
    `INSERT INTO scooters (id, name) SELECT * FROM unnest($1::varchar[], $2::varchar[])
     ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, name = EXCLUDED.name`,
    [DEFAULT_SCOOTERS.map((s) => s.id), DEFAULT_SCOOTERS.map((s) => s.name)],
  );
  // Filo SQL ile değişti (duyurusuz): bellekteki kayıt listesi de yenilensin.
  await app.get(ScooterRegistry).refresh();
}

/** Yeni sürücü hesabı açar; oturum token'ını döner. */
export async function registerRider(
  app: INestApplication,
  username: string,
  password = 'sifre-12345',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ username, password })
    .expect(201);
  return (res.body as { token: string }).token;
}

/** Sürücü oturumuyla scooter kiralar. */
export const rentScooter = (
  app: INestApplication,
  token: string,
  scooterId: string,
) =>
  request(app.getHttpServer())
    .post('/rentals')
    .set('authorization', `Bearer ${token}`)
    .send({ scooterId });

/** Kuyrukta bekleyen/işlenen iş kalmayana kadar bekler. */
export async function waitForQueueDrain(
  app: INestApplication,
  timeoutMs = 15_000,
): Promise<void> {
  const lanes = app.get(LocationLanes);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const counts = await lanes.counts(
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

/** Sabit bir başlangıç anından `seconds` saniye sonrası (ISO 8601): testler saatten bağımsız. */
const T0 = Date.parse('2026-01-01T09:00:00.000Z');
export const at = (seconds: number) =>
  new Date(T0 + seconds * 1000).toISOString();

/** Konum gönderir, 202 bekler. */
export const sendLocation = (
  app: INestApplication,
  userId: string,
  point: { lat: number; lng: number },
  seconds: number,
) =>
  request(app.getHttpServer())
    .post('/locations')
    .send({ userId, ...point, timestamp: at(seconds) })
    .expect(202);

export interface LogRow {
  id: string;
  userId: string;
  areaId: string;
  entryTime: string;
  exitTime: string | null;
  exitReason: `${ExitReason}` | null;
  lastSeenAt: string | null;
}

/** Kullanıcının giriş kayıtları (en yeni başta). API anahtarı gerekiyorsa `apiKey`. */
export const logsFor = async (
  app: INestApplication,
  userId: string,
  apiKey?: string,
) =>
  (
    await request(app.getHttpServer())
      .get('/logs')
      .set(apiKey ? { 'x-api-key': apiKey } : {})
      .query({ userId })
      .expect(200)
  ).body.data as LogRow[];
