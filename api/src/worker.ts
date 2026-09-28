import './config/env.js';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { loadConfigOrExit } from './config/configuration.js';
import { createLogger } from './config/logger.js';
import { allUp, checkDependencies } from './health/dependency-check.js';
import { startMetricsServer } from './metrics/metrics-server.js';
import { LocationLanes } from './queue/location-lanes.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  const config = loadConfigOrExit();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: createLogger(),
  });
  app.enableShutdownHooks();

  const port = config.observability.workerMetricsPort;
  if (port > 0) {
    // Kapanış başlayınca hazır değil: orkestratör yeni iş beklemez, süreç işini bitirip çıkar.
    let closing = false;
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const lanes = app.get(LocationLanes);
    const server = startMetricsServer(
      port,
      undefined,
      async () => !closing && allUp(await checkDependencies(dataSource, lanes)),
    );
    process.once('SIGTERM', () => {
      closing = true;
      server.close();
    });
  }
}
await bootstrap();
