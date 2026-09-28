import type { Rider } from '@shared/api/types';

/** Giriş ekranının sekmesi. */
export const Mode = { LOGIN: 'login', REGISTER: 'register' } as const;

export type Mode = (typeof Mode)[keyof typeof Mode];

/** Tarayıcıda saklanan sürücü oturumu. */
export interface StoredSession {
  token: string;
  rider: Rider;
}
