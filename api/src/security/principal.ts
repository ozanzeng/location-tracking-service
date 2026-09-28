import type { Request } from 'express';
import { PrincipalKind } from './principal-kind.enum.js';
import type {
  RiderPrincipal,
  AdminPrincipal,
  Principal,
} from './security.types.js';

export const isRider = (p: Principal | undefined | null): p is RiderPrincipal =>
  p?.kind === PrincipalKind.RIDER;

export const isAdmin = (p: Principal | undefined | null): p is AdminPrincipal =>
  p?.kind === PrincipalKind.ADMIN;

/** Loglarda kimin yaptığı: "admin:ayse", "rider:ali", "service". */
export function describePrincipal(p: Principal | undefined): string {
  if (!p) return 'anonim';
  return p.kind === PrincipalKind.SERVICE ? p.kind : `${p.kind}:${p.username}`;
}

/** `Authorization: Bearer <token>` başlığındaki token; yoksa ya da biçimi bozuksa null. */
export function bearerToken(req: Pick<Request, 'header'>): string | null {
  return parseBearer(req.header('authorization'));
}

export function parseBearer(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(value);
  return match ? match[1] : null;
}
