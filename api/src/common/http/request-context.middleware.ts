import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_PATTERN as REQUEST_ID } from '../../config/limits.js';
import { httpRequestDuration } from '../../metrics/metrics.js';

/**
 * Her isteğe bir kimlik verir (gelen x-request-id korunur), süre metriğini kaydeder
 * ve erişim logu yazar. Erişim logu "verbose" seviyesindedir; yük altında log
 * hacmi patlamasın diye production'da varsayılan olarak kapalıdır.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    req.id = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.id);

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      // Etiket olarak ham URL değil rota şablonu: /logs?userId=... ayrı seriler üretmesin.
      const route = req.route?.path
        ? `${req.baseUrl}${req.route.path as string}`
        : 'unmatched';
      httpRequestDuration.observe(
        { method: req.method, route, status_code: String(res.statusCode) },
        seconds,
      );
      this.logger.verbose({
        requestId: req.id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(seconds * 1000 * 10) / 10,
      });
    });
    next();
  }
}
