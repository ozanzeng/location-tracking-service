import type { AreaRef, AreaType } from '@shared/api/types';
import { dominantZone } from '@shared/zones/zoneStyles';

/** Scooter imlecinin rengi: sürüş yoksa boş halka, hizmet bölgesi dışında gri, yoksa en kısıtlayıcı bölge. */
export type RiderZone = AreaType | 'IDLE' | 'NONE';

export function riderZone(riding: boolean, currentAreas: AreaRef[]): RiderZone {
  if (!riding) return 'IDLE';
  const types = currentAreas.map((a) => a.type);
  if (!types.includes('SERVICE') && !types.includes('NO_RIDE')) return 'NONE';
  return dominantZone(types) ?? 'SERVICE';
}
