import type { Request } from 'express';
import { PrincipalKind } from './principal-kind.enum.js';

export interface RiderPrincipal {
  kind: PrincipalKind.RIDER;
  riderId: string;
  username: string;
}

export type Principal = { kind: PrincipalKind.SERVICE } | RiderPrincipal;

export const SERVICE_PRINCIPAL: Principal = { kind: PrincipalKind.SERVICE };

declare module 'express' {
  interface Request {
    /** AuthGuard'ın atadığı kimlik. */
    principal?: Principal;
  }
}

export const isRider = (p: Principal | undefined): p is RiderPrincipal =>
  p?.kind === PrincipalKind.RIDER;

/** `Authorization: Bearer <token>` başlığındaki token; yoksa ya da biçimi bozuksa null. */
export function bearerToken(req: Pick<Request, 'header'>): string | null {
  return parseBearer(req.header('authorization'));
}

export function parseBearer(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(value);
  return match ? match[1] : null;
}
