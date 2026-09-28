import type { AreaType } from '@shared/api/types';
import { isOutsideService } from './scooterColor';
import type { Counts } from './live.types';

/** Anlık sayaçlar: toplam, bölge tipine göre ve hizmet bölgesi dışında (haritadaki gri). */
export function countScooters(scooters: Iterable<{ types: AreaType[] }>): Counts {
  const counts: Counts = { total: 0, outside: 0 };
  for (const s of scooters) {
    counts.total++;
    if (isOutsideService(s.types)) counts.outside++;
    for (const t of new Set(s.types)) counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}
