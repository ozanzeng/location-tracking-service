/** Ağ ve bağlantı hataları: veritabanı kapalı, yeniden başlıyor, DNS henüz çözülemiyor. */
export const NETWORK_CODES = new Set([
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
export const TRANSIENT_SQLSTATE = new Set([
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '40001',
  '40P01',
  '57014',
]);

/** Kodsuz gelen sürücü mesajları (bağlantı havuzu, kopan bağlantı). */
export const TRANSIENT_MESSAGES = [
  /connection terminated/i,
  /timeout exceeded when trying to connect/i,
  /connection is closed/i,
];
