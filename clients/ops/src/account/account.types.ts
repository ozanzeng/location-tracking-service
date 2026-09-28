import type { Admin } from '@shared/api/types';

/** Tarayıcıda saklanan yönetici oturumu. */
export interface StoredAdminSession {
  token: string;
  admin: Admin;
}
