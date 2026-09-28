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
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { ACCESS } from './access.decorator.js';
import { Access } from './access.enum.js';
import { bearerToken, SERVICE_PRINCIPAL } from './principal.js';
import { IS_PUBLIC } from './public.decorator.js';
import { RiderSessions } from './rider-sessions.js';

export const API_KEY_HEADER = 'x-api-key';

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
 * İki tür kimlik:
 * - Tam yetkili API anahtarı (x-api-key): mobil backend, gateway, operasyon paneli, betikler.
 *   Anahtar tanımlı değilse doğrulama kapalıdır (yerel geliştirme).
 * - Sürücü oturumu (Authorization: Bearer): sadece @AllowRiders ve @RidersOnly uç noktalar.
 *
 * Sürücü token'ı varsa önce ona bakılır: anahtar doğrulaması kapalıyken de sürücü kimliği
 * isteğe bağlanır (kiralama gibi kimin adına yapıldığı önemli işlemler için). Geçersiz ya da
 * süresi dolmuş token 401 alır; anahtara geri düşülmez, istemci yeniden giriş yapmalı.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly security: AppConfig['security'];

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: RiderSessions,
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
    const access = this.reflector.getAllAndOverride<Access | undefined>(
      ACCESS,
      targets,
    );
    const req = context.switchToHttp().getRequest<Request>();

    const token = bearerToken(req);
    if (token) {
      const rider = await this.sessions.resolve(token);
      if (!rider) {
        throw new UnauthorizedException(
          'Oturum geçersiz ya da süresi dolmuş; yeniden giriş yapın',
        );
      }
      if (!access) {
        throw new ForbiddenException('Bu işlem sürücü hesabına açık değil');
      }
      req.principal = rider;
      return true;
    }

    if (access === Access.RIDER) {
      throw new UnauthorizedException('Sürücü girişi gerekli');
    }
    if (isValidApiKey(this.security.apiKeys, req.header(API_KEY_HEADER))) {
      req.principal = SERVICE_PRINCIPAL;
      return true;
    }
    throw new UnauthorizedException(
      'Geçerli bir x-api-key başlığı ya da sürücü oturumu gerekli',
    );
  }
}
