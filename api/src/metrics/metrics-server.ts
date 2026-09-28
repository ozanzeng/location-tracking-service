import { createServer, type Server } from 'node:http';
import { Logger } from '@nestjs/common';
import { collectProcessMetrics, metricsRegistry } from './metrics.js';
import type { ReadinessCheck } from './metrics.types.js';

/**
 * Worker'ın HTTP API'si yok; bu küçük sunucu Prometheus için /metrics ile orkestratör için
 * /health/live (süreç cevap veriyor) ve /health/ready (veritabanı ve Redis erişilebilir,
 * kapanış başlamadı) yayınlar. Port doluysa (EADDRINUSE) worker düşmez: metrikler olmadan
 * konum işlemeye devam eder.
 */
export function startMetricsServer(
  port: number,
  logger = new Logger('Metrics'),
  ready: ReadinessCheck = async () => true,
): Server {
  collectProcessMetrics();
  const json = (
    res: import('node:http').ServerResponse,
    status: number,
    body: object,
  ) =>
    res
      .writeHead(status, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(body));
  const server = createServer((req, res) => {
    if (req.url === '/health/live') return json(res, 200, { status: 'ok' });
    if (req.url === '/health/ready') {
      ready().then(
        (ok) => json(res, ok ? 200 : 503, { status: ok ? 'ok' : 'error' }),
        () => json(res, 503, { status: 'error' }),
      );
      return;
    }
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
  server.listen(port, () =>
    logger.log(`Worker metrikleri ve sağlık kontrolü :${port}`),
  );
  return server;
}
