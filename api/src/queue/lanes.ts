/**
 * Kullanıcının şeridi: aynı kullanıcı her zaman aynı şeride düşer. FNV-1a (32 bit), çünkü
 * hızlı, bağımlılıksız ve API instance'ları arasında her yerde aynı sonucu verir.
 */
export function laneOf(userId: string, lanes: number): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(userId, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % lanes;
}

/** BullMQ kuyruk adında ':' kullanılamaz. */
export const laneQueueName = (lane: number) => `locations-${lane}`;
