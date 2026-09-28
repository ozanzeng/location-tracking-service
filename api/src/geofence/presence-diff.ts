import type { PresenceDiff } from './geofence.types.js';

/**
 * Önceki ve şimdiki alan kümelerinden giriş/çıkışları hesaplar.
 * İçeride kalınan alanlar hiçbir olay üretmez.
 */
export function diffPresence(
  previous: readonly string[],
  current: readonly string[],
): PresenceDiff {
  const prev = new Set(previous);
  const curr = new Set(current);
  return {
    entered: [...curr].filter((id) => !prev.has(id)),
    exited: [...prev].filter((id) => !curr.has(id)),
  };
}
