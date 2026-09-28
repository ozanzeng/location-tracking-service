import type { ROUTES } from './app.constants';

/** Panelin ekranları (adres çubuğundaki #/...). */
export type Route = (typeof ROUTES)[number]['hash'];

/** Oturum durumu: saklı oturum doğrulanıyor, giriş ekranı ya da panel. */
export const Gate = {
  CHECKING: 'checking',
  SIGNED_OUT: 'signed-out',
  SIGNED_IN: 'signed-in',
} as const;

export type GateState =
  | { kind: typeof Gate.CHECKING }
  | { kind: typeof Gate.SIGNED_OUT; notice: string | null }
  | { kind: typeof Gate.SIGNED_IN };
