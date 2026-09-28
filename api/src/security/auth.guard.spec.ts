import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { loadConfig } from '../config/configuration.js';
import { ACCESS } from './access.decorator.js';
import { Access } from './access.enum.js';
import { AuthGuard } from './auth.guard.js';
import { PrincipalKind } from './principal-kind.enum.js';
import type { RiderPrincipal } from './principal.js';
import { IS_PUBLIC } from './public.decorator.js';
import type { RiderSessions } from './rider-sessions.js';

const TOKEN = 'gecerli-token-1234567890';
const RIDER: RiderPrincipal = {
  kind: PrincipalKind.RIDER,
  riderId: 'r1',
  username: 'ali',
};

const requestWith = (headers: Record<string, string | undefined>) =>
  ({ header: (name: string) => headers[name] }) as unknown as Request;

const contextWith = (req: Request, type = 'http') =>
  ({
    getType: () => type,
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

const guardWith = (
  apiKeys: string[],
  { isPublic = false, access = undefined as Access | undefined } = {},
) =>
  new AuthGuard(
    {
      getAllAndOverride: (key: string) =>
        key === IS_PUBLIC ? isPublic : key === ACCESS ? access : undefined,
    } as unknown as Reflector,
    {
      resolve: async (token: string) => (token === TOKEN ? RIDER : null),
    } as unknown as RiderSessions,
    {
      ...loadConfig({}),
      security: { ...loadConfig({}).security, apiKeys },
    },
  );

const activate = (
  guard: AuthGuard,
  headers: Record<string, string | undefined>,
) => {
  const req = requestWith(headers);
  return guard.canActivate(contextWith(req)).then((ok) => ({ ok, req }));
};

describe('AuthGuard', () => {
  describe('API anahtarı', () => {
    it('anahtar tanımlı değilse herkese izin verir (yerel geliştirme)', async () => {
      const { ok, req } = await activate(guardWith([]), {});
      expect(ok).toBe(true);
      expect(req.principal).toEqual({ kind: PrincipalKind.SERVICE });
    });

    it('geçerli anahtarlardan birini kabul eder', async () => {
      await expect(
        activate(guardWith(['k1', 'k2']), { 'x-api-key': 'k2' }),
      ).resolves.toMatchObject({ ok: true });
    });

    it.each([{}, { 'x-api-key': 'yanlis' }, { 'x-api-key': 'k' }])(
      '%o → 401',
      async (headers) => {
        await expect(activate(guardWith(['k1']), headers)).rejects.toThrow(
          UnauthorizedException,
        );
      },
    );
  });

  it('WebSocket mesajlarını HTTP olarak ele almaz', async () => {
    await expect(
      guardWith(['k1']).canActivate(contextWith(requestWith({}), 'ws')),
    ).resolves.toBe(true);
  });

  it('@Public uç noktalar kimlik istemez', async () => {
    await expect(
      activate(guardWith(['k1'], { isPublic: true }), {}),
    ).resolves.toMatchObject({ ok: true });
  });

  describe('sürücü oturumu', () => {
    const bearer = { authorization: `Bearer ${TOKEN}` };

    it('@AllowRiders uç noktalara erişir ve sürücü isteğe bağlanır', async () => {
      const { ok, req } = await activate(
        guardWith(['k1'], { access: Access.RIDER_OR_SERVICE }),
        bearer,
      );
      expect(ok).toBe(true);
      expect(req.principal).toEqual(RIDER);
    });

    it('anahtar doğrulaması kapalıyken de sürücü kimliği bağlanır', async () => {
      const { req } = await activate(
        guardWith([], { access: Access.RIDER }),
        bearer,
      );
      expect(req.principal).toEqual(RIDER);
    });

    it('işaretlenmemiş uç noktalarda 403 (loglar, alan oluşturma, filo yönetimi)', async () => {
      await expect(activate(guardWith(['k1']), bearer)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('geçersiz ya da süresi dolmuş token 401 alır, anahtara geri düşülmez', async () => {
      await expect(
        activate(guardWith(['k1'], { access: Access.RIDER_OR_SERVICE }), {
          authorization: 'Bearer suresi-dolmus-token-123',
          'x-api-key': 'k1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('@RidersOnly uç noktalar API anahtarıyla çağrılamaz', async () => {
      await expect(
        activate(guardWith(['k1'], { access: Access.RIDER }), {
          'x-api-key': 'k1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
