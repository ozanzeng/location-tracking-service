import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
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

/**
 * Servis, mobil uygulamanın backend'i veya API gateway gibi güvenilen istemcilerden
 * çağrılır varsayımıyla basit anahtar kontrolü. Anahtar tanımlı değilse kapalıdır.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly keys: string[];

  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.keys = config.security.apiKeys;
  }

  canActivate(context: ExecutionContext): boolean {
    // WebSocket bağlantıları anahtarı el sıkışmada doğrular (RealtimeGateway).
    if (context.getType() !== 'http' || this.keys.length === 0) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const provided = context
      .switchToHttp()
      .getRequest<Request>()
      .header(API_KEY_HEADER);
    if (isValidApiKey(this.keys, provided)) return true;
    throw new UnauthorizedException('Geçerli bir x-api-key başlığı gerekli');
  }
}
