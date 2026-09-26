/**
 * İstek kimliği (UUID v4). crypto.randomUUID sadece güvenli bağlamda (HTTPS, localhost)
 * tanımlı: telefon LAN IP'si üzerinden HTTP ile açınca yoktur ve her istek hata verirdi.
 * crypto.getRandomValues her bağlamda vardır.
 */
export function newRequestId(c: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string } = crypto): string {
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // sürüm 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 varyantı
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
