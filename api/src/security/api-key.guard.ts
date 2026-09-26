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
import { INGEST_ALLOWED } from './ingest-allowed.decorator.js';
import { IS_PUBLIC } from './public.decorator.js';

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

/** full: her şey; ingest: sadece konum gönderme (bkz. AppConfig.security.ingestApiKeys). */
export type KeyScope = 'full' | 'ingest';

/** Anahtarın yetkisi; geçersizse null. Anahtar tanımlı değilse doğrulama kapalıdır. */
export function apiKeyScope(
  security: AppConfig['security'],
  provided: unknown,
): KeyScope | null {
  if (security.apiKeys.length === 0) return 'full';
  if (isValidApiKey(security.apiKeys, provided)) return 'full';
  if (
    security.ingestApiKeys.length > 0 &&
    isValidApiKey(security.ingestApiKeys, provided)
  ) {
    return 'ingest';
  }
  return null;
}

/**
 * Servis, mobil uygulamanın backend'i veya API gateway gibi güvenilen istemcilerden
 * çağrılır varsayımıyla basit anahtar kontrolü. Anahtar tanımlı değilse kapalıdır.
 * Sürücü anahtarı sadece @IngestAllowed uç noktalara erişir, diğerlerinde 403.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly security: AppConfig['security'];

  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.security = config.security;
  }

  canActivate(context: ExecutionContext): boolean {
    // WebSocket bağlantıları anahtarı el sıkışmada doğrular (RealtimeGateway).
    if (context.getType() !== 'http' || this.security.apiKeys.length === 0)
      return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    const provided = context
      .switchToHttp()
      .getRequest<Request>()
      .header(API_KEY_HEADER);
    const scope = apiKeyScope(this.security, provided);
    if (scope === 'full') return true;
    if (scope === 'ingest') {
      if (this.reflector.getAllAndOverride<boolean>(INGEST_ALLOWED, targets)) {
        return true;
      }
      throw new ForbiddenException('Bu anahtar sadece konum gönderebilir');
    }
    throw new UnauthorizedException('Geçerli bir x-api-key başlığı gerekli');
  }
}
