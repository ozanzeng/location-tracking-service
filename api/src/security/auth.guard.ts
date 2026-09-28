import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Access } from './access.enum.js';
import { PrincipalKind } from './principal-kind.enum.js';
import { bearerToken } from './principal.js';
import { Sessions } from './sessions.js';
import {
  SERVICE_PRINCIPAL,
  ACCESS,
  IS_PUBLIC,
  API_KEY_HEADER,
  ACCESS_RULES,
} from './security.constants.js';
import type { AppConfig } from '../config/configuration.types.js';
import { APP_CONFIG } from '../config/config.constants.js';

/** Sabit süreli karşılaştırma: anahtar karakter karakter tahmin edilemesin. */
export function isValidApiKey(keys: string[], provided: unknown): boolean {
  if (keys.length === 0) return true;
  if (typeof provided !== 'string') return false;
  const candidate = Buffer.from(provided);
  return keys.some((key) => {
    const expected = Buffer.from(key);
    return (
      expected.length === candidate.length &&
      timingSafeEqual(expected, candidate)
    );
  });
}

/**
 * Üç tür kimlik:
 * - Tam yetkili API anahtarı (x-api-key): mobil backend, gateway, filo sistemi, betikler.
 *   Anahtar tanımlı değilse doğrulama kapalıdır (yerel geliştirme).
 * - Sürücü oturumu (Authorization: Bearer): kiralama ve konum gönderme.
 * - Yönetici oturumu (Authorization: Bearer): operasyon paneli.
 * Hangi uç noktaya kimin girebildiği Access düzeyiyle belirlenir (ACCESS_RULES).
 *
 * Token varsa önce ona bakılır: anahtar doğrulaması kapalıyken de kimlik isteğe bağlanır
 * (kiralama gibi kimin adına yapıldığı önemli işlemler için). Geçersiz ya da süresi dolmuş
 * token 401 alır; anahtara geri düşülmez, istemci yeniden giriş yapmalı.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly security: AppConfig['security'];

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: Sessions,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.security = config.security;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // WebSocket bağlantıları kimliği el sıkışmada doğrular (RealtimeGateway).
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }
    const access =
      this.reflector.getAllAndOverride<Access | undefined>(ACCESS, targets) ??
      Access.OPERATOR;
    const req = context.switchToHttp().getRequest<Request>();

    const token = bearerToken(req);
    if (token) {
      const principal = await this.sessions.resolve(token);
      if (!principal) {
        throw new UnauthorizedException(
          'Oturum geçersiz ya da süresi dolmuş; yeniden giriş yapın',
        );
      }
      if (!ACCESS_RULES[access].includes(principal.kind)) {
        throw new ForbiddenException(
          principal.kind === PrincipalKind.ADMIN
            ? 'Bu işlem yönetici hesabına açık değil'
            : 'Bu işlem sürücü hesabına açık değil',
        );
      }
      req.principal = principal;
      return true;
    }

    if (access === Access.RIDER) {
      throw new UnauthorizedException('Sürücü girişi gerekli');
    }
    if (access === Access.ADMIN) {
      throw new UnauthorizedException('Yönetici girişi gerekli');
    }
    if (isValidApiKey(this.security.apiKeys, req.header(API_KEY_HEADER))) {
      req.principal = SERVICE_PRINCIPAL;
      return true;
    }
    throw new UnauthorizedException(
      'Geçerli bir x-api-key başlığı ya da oturum gerekli',
    );
  }
}
