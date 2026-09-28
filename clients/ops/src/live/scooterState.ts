import { SCOOTER_ACTIVE_MS, SCOOTER_IDLE_MS } from '../config';
import type { Counts } from './scooterCounts';

/**
 * Gelen konum haritaya uygulanmalı mı? Açılıştaki "son konumlar" isteği canlı yayından sonra
 * gelebilir; o zaman eski konum yenisini ezmesin (scooter yanlış yerde ve renkte kalırdı).
 * Karşılaştırma konumun ölçüldüğü zamanla yapılır, gelme sırasıyla değil.
 */
export const isNewerPosition = (current: number | undefined, incoming: number) =>
  current === undefined || incoming >= current;

/** Scooter'ın son görülmesinden bu yana geçen süreye göre durumu. */
export type Silence = 'active' | 'idle' | 'gone';

export function silence(now: number, seenAt: number): Silence {
  const silent = now - seenAt;
  if (silent > SCOOTER_ACTIVE_MS) return 'gone';
  if (silent > SCOOTER_IDLE_MS) return 'idle';
  return 'active';
}

/** Sayaçlar değişmediyse yeniden yayınlanmasın: harita ağacı saniyede bir boşuna çizilmesin. */
export function sameCounts(a: Counts | null, b: Counts): boolean {
  if (!a) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Counts>;
  for (const key of keys) if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
  return true;
}
