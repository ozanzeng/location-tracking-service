import { ADMIN_SESSION_STORAGE_KEY as KEY } from '../config';
import type { StoredAdminSession } from './account.types';

/** Oturum tarayıcıda saklanır: sayfa yenilenince yeniden giriş gerekmez (süresi dolana kadar). */
export function loadAdminSession(): StoredAdminSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredAdminSession) : null;
  } catch {
    // Depolama kapalı ya da bozuk kayıt: yeniden giriş.
    return null;
  }
}

export function saveAdminSession(session: StoredAdminSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Depolama kapalıysa oturum bu sekmeyle sınırlı kalır.
  }
}

export function clearAdminSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // yok say
  }
}
