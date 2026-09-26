import './config/env.js';
import { NestFactory } from '@nestjs/core';
import { loadConfigOrExit } from './config/configuration.js';
import { createLogger } from './config/logger.js';
import { startMetricsServer } from './metrics/metrics-server.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  const config = loadConfigOrExit();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: createLogger(),
  });
  app.enableShutdownHooks();

  const port = config.observability.workerMetricsPort;
  if (port > 0) {
    const server = startMetricsServer(port);
    process.once('SIGTERM', () => server.close());
  }
}
await bootstrap();
