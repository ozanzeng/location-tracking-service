import { SESSION_STORAGE_KEY as KEY } from '../config';
import type { StoredSession } from './account.types';

/** Oturum tarayıcıda saklanır: sayfa yenilenince giriş ve sürüş kaldığı yerden devam eder. */
export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    // Depolama kapalı ya da bozuk kayıt: yeniden giriş.
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Depolama kapalıysa oturum bu sekmeyle sınırlı kalır.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // yok say
  }
}
