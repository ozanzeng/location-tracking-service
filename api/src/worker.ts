import './config/env.js';
import { createServer } from 'node:http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfigOrExit } from './config/configuration.js';
import { createLogger } from './config/logger.js';
import { collectProcessMetrics, metricsRegistry } from './metrics/metrics.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  const config = loadConfigOrExit();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: createLogger(),
  });
  app.enableShutdownHooks();

  // Worker'ın HTTP API'si yok; Prometheus'un kazıyabilmesi için sadece /metrics.
  const port = config.observability.workerMetricsPort;
  if (port > 0) {
    collectProcessMetrics();
    const server = createServer((req, res) => {
      if (req.url !== '/metrics') {
        res.writeHead(404).end();
        return;
      }
      metricsRegistry.metrics().then(
        (body) =>
          res
            .writeHead(200, { 'Content-Type': metricsRegistry.contentType })
            .end(body),
        () => res.writeHead(500).end(),
      );
    });
    server.listen(port, () =>
      new Logger('Metrics').log(`Worker metrikleri :${port}/metrics`),
    );
    process.once('SIGTERM', () => server.close());
  }
}
await bootstrap();
