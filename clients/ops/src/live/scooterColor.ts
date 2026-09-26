import type { AreaType } from '@shared/api/types';
import { dominantZone } from '@shared/zones/zoneStyles';

/** Scooter noktasının rengi: içinde bulunduğu en kısıtlayıcı bölge; hizmet bölgesi dışı gri. */
export function scooterColor(types: Iterable<AreaType>): string {
  const set = new Set(types);
  if (!set.has('SERVICE') && !set.has('NO_RIDE')) return '#8A8F98';
  const zone = dominantZone(set);
  if (zone === 'NO_RIDE') return '#D7263D';
  if (zone === 'SLOW') return '#F2A900';
  if (zone === 'PARKING') return '#1F5FAD';
  return '#2B2F36';
}
