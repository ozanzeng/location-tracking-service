import {
  type ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RetryableHttpException } from './retryable.exception.js';

/**
 * Tek global hata filtresi.
 * - 429/503: istemcinin ne kadar sonra tekrar deneyeceği Retry-After başlığıyla bildirilir.
 * - Diğer HTTP hataları Nest'in standart biçimiyle döner. Express'in kendi hataları da
 *   (bozuk JSON 400, fazla büyük gövde 413; http-errors imzası) kendi koduyla döner.
 * - Beklenmeyen hatalar (DB, Redis kesintisi, hata) 500 döner ve bir kez, istek kimliği,
 *   method ve yolla loglanır. Nest'in varsayılan logunda bunlar yoktu; istemcinin aldığı
 *   x-request-id ile API tarafındaki hata eşleştirilemiyordu.
 */
@Catch()
export class AppExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('HTTP');

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return super.catch(exception, host);
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof RetryableHttpException) {
      res.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }
    if (exception instanceof HttpException) {
      return super.catch(exception, host);
    }
    // İstemci hatası (bozuk JSON, fazla büyük gövde): kendi koduyla döner, ERROR loglanmaz.
    if (this.isHttpError(exception) && exception.statusCode < 500) {
      const { statusCode, message } = exception;
      res.status(statusCode).json({ statusCode, message });
      return;
    }

    const req = host.switchToHttp().getRequest<Request>();
    const error =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error({
      message: 'Beklenmeyen hata',
      requestId: req.id,
      method: req.method,
      path: req.path,
      error: error.message,
      stack: error.stack,
    });
    if (res.headersSent) return;
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      requestId: req.id,
    });
  }
}
