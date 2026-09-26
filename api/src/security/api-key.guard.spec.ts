import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { loadConfig } from '../config/configuration.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { INGEST_ALLOWED } from './ingest-allowed.decorator.js';
import { IS_PUBLIC } from './public.decorator.js';

const contextWith = (
  headers: Record<string, string | undefined>,
  type = 'http',
) =>
  ({
    getType: () => type,
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ header: (name: string) => headers[name] }),
    }),
  }) as unknown as ExecutionContext;

const guardWith = (
  apiKeys: string[],
  isPublic = false,
  { ingestApiKeys = [] as string[], ingestAllowed = false } = {},
) =>
  new ApiKeyGuard(
    {
      getAllAndOverride: (key: string) =>
        key === IS_PUBLIC ? isPublic : key === INGEST_ALLOWED && ingestAllowed,
    } as unknown as Reflector,
    {
      ...loadConfig({}),
      security: { ...loadConfig({}).security, apiKeys, ingestApiKeys },
    },
  );

describe('ApiKeyGuard', () => {
  it('anahtar tanımlı değilse herkese izin verir', () => {
    expect(guardWith([]).canActivate(contextWith({}))).toBe(true);
  });

  it('geçerli anahtarlardan birini kabul eder', () => {
    const guard = guardWith(['k1', 'k2']);
    expect(guard.canActivate(contextWith({ 'x-api-key': 'k2' }))).toBe(true);
  });

  it.each([{}, { 'x-api-key': 'yanlis' }, { 'x-api-key': 'k' }])(
    '%o → 401',
    (headers) => {
      expect(() => guardWith(['k1']).canActivate(contextWith(headers))).toThrow(
        UnauthorizedException,
      );
    },
  );

  it('WebSocket mesajlarını HTTP olarak ele almaz', () => {
    expect(guardWith(['k1']).canActivate(contextWith({}, 'ws'))).toBe(true);
  });

  it('@Public uç noktalar anahtar istemez', () => {
    expect(guardWith(['k1'], true).canActivate(contextWith({}))).toBe(true);
  });

  describe('sürücü (INGEST_API_KEYS) anahtarı', () => {
    const scoped = (ingestAllowed: boolean) =>
      guardWith(['ops'], false, { ingestApiKeys: ['drv'], ingestAllowed });

    it('konum gönderme gibi @IngestAllowed uç noktalara erişir', () => {
      expect(
        scoped(true).canActivate(contextWith({ 'x-api-key': 'drv' })),
      ).toBe(true);
    });

    it('diğer uç noktalarda 403 (loglar, alan oluşturma)', () => {
      expect(() =>
        scoped(false).canActivate(contextWith({ 'x-api-key': 'drv' })),
      ).toThrow(ForbiddenException);
    });

    it('tam yetkili anahtar her yere erişir', () => {
      expect(
        scoped(false).canActivate(contextWith({ 'x-api-key': 'ops' })),
      ).toBe(true);
    });
  });
});
