import { createServer, type Server } from 'node:http';
import { Logger } from '@nestjs/common';
import { collectProcessMetrics, metricsRegistry } from './metrics.js';

/**
 * Worker'ın HTTP API'si yok; Prometheus'un kazıyabilmesi için sadece /metrics.
 * Port doluysa (EADDRINUSE) worker düşmez: metrikler olmadan konum işlemeye devam eder.
 */
export function startMetricsServer(
  port: number,
  logger = new Logger('Metrics'),
): Server {
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
  server.on('error', (err) =>
    logger.error(
      `Metrik sunucusu :${port} açılamadı, worker metriksiz çalışıyor: ${err.message}`,
    ),
  );
  server.listen(port, () => logger.log(`Worker metrikleri :${port}/metrics`));
  return server;
}
