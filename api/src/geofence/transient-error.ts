/** Ağ ve bağlantı hataları: veritabanı kapalı, yeniden başlıyor, DNS henüz çözülemiyor. */
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/**
 * Postgres SQLSTATE: sunucu kapanıyor/açılıyor (57P0x), bağlantı sınırı (53300), eşzamanlılık
 * çakışması (40001, 40P01), sorgu zaman aşımı (57014). 08 sınıfı: bağlantı hataları.
 */
const TRANSIENT_SQLSTATE = new Set([
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '40001',
  '40P01',
  '57014',
]);

/** Kodsuz gelen sürücü mesajları (bağlantı havuzu, kopan bağlantı). */
const TRANSIENT_MESSAGES = [
  /connection terminated/i,
  /timeout exceeded when trying to connect/i,
  /connection is closed/i,
];

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
