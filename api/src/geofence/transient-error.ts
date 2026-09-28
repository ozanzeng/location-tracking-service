import {
  NETWORK_CODES,
  TRANSIENT_SQLSTATE,
  TRANSIENT_MESSAGES,
} from './geofence.constants.js';

/**
 * Hata geçici mi (altyapı toparlanınca aynı işlem başarılı olur) yoksa kalıcı mı (veri ya da
 * kod hatası, tekrar denemek düzeltmez)? Geçicide iş, altyapı dönene kadar beklenir; kalıcıda
 * birkaç denemeden sonra bırakılır ki şerit tıkanmasın.
 */
export function isTransientError(err: unknown): boolean {
  const e = err as {
    code?: unknown;
    driverError?: { code?: unknown };
    message?: unknown;
  } | null;
  const code = e?.driverError?.code ?? e?.code;
  if (typeof code === 'string') {
    if (NETWORK_CODES.has(code) || TRANSIENT_SQLSTATE.has(code)) return true;
    if (code.startsWith('08')) return true;
  }
  const message = typeof e?.message === 'string' ? e.message : '';
  return TRANSIENT_MESSAGES.some((pattern) => pattern.test(message));
}
