import { PrincipalKind } from './principal-kind.enum.js';
import type { Redis } from 'ioredis';

/** Sürücü oturumuyla gelen kimlik. */
export interface RiderPrincipal {
  kind: PrincipalKind.RIDER;
  riderId: string;
  username: string;
}

/** Yönetici oturumuyla gelen kimlik. */
export interface AdminPrincipal {
  kind: PrincipalKind.ADMIN;
  adminId: string;
  username: string;
}

/** Oturum token'ıyla gelen kimlik (sürücü ya da yönetici). */
export type SessionPrincipal = RiderPrincipal | AdminPrincipal;

/** İsteği yapan: API anahtarı, yönetici ya da sürücü. */
export type Principal = { kind: PrincipalKind.SERVICE } | SessionPrincipal;

export type SessionKind = SessionPrincipal['kind'];

/** Redis'te saklanan oturum kaydı. */
export interface StoredSession {
  /** İlk sürümün kayıtlarında yok: onlar sürücü oturumudur. */
  kind?: SessionKind;
  /** Sürücü ya da yönetici kimliği. İlk sürümün kayıtlarında riderId. */
  id?: string;
  riderId?: string;
  username: string;
}

/** Lua betiği tanımlanmış Redis bağlantısı (rate limit). */
export type RateLimitRedis = Redis & {
  consumeRateLimit(
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<number[]>;
};

declare module 'express' {
  interface Request {
    /** AuthGuard'ın atadığı kimlik. */
    principal?: Principal;
  }
}
