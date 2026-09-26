import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { loadConfig } from '../config/configuration.js';
import { ApiKeyGuard } from './api-key.guard.js';

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

const guardWith = (apiKeys: string[], isPublic = false) =>
  new ApiKeyGuard(
    { getAllAndOverride: () => isPublic } as unknown as Reflector,
    { ...loadConfig({}), security: { ...loadConfig({}).security, apiKeys } },
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
});
