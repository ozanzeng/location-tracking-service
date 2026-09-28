import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { Access } from '../../security/access.enum.js';
import { describePrincipal } from '../../security/principal.js';
import { READ_METHODS } from './http.constants.js';
import { ACCESS } from '../../security/security.constants.js';

/**
 * İşlem geçmişi: veriyi değiştiren başarılı istekler kimin yaptığıyla loglanır ("Audit"
 * bağlamı, JSON logda ayrı alan): "admin:ayse DELETE /scooters/scooter-07 → 204". Konum
 * gönderme (saniyede binlerce istek) ve sürücü işlemleri dışarıda: onların izi zaten
 * kayıtlarda ve kiralamalarda.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const access = this.reflector.getAllAndOverride<Access | undefined>(
      ACCESS,
      [context.getHandler(), context.getClass()],
    );
    if (
      READ_METHODS.has(req.method) ||
      access === Access.DEVICE ||
      access === Access.RIDER ||
      !req.principal
    ) {
      return next.handle();
    }
    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse<Response>();
        this.logger.log(
          `${describePrincipal(req.principal)} ${req.method} ${req.originalUrl} → ${res.statusCode}`,
        );
      }),
    );
  }
}
