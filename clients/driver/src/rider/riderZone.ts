import { AreaType, type AreaRef } from '@shared/api/types';
import { dominantZone } from '@shared/zones/zoneStyles';

/** Bölge dışındaki imleç durumları (CSS'te data-zone değeri). */
export const RiderState = {
  /** Sürüş yok: boş halka. */
  IDLE: 'IDLE',
  /** Hizmet bölgesi dışında: gri. */
  NONE: 'NONE',
} as const;

/** Scooter imlecinin rengi: sürüş yoksa boş halka, hizmet bölgesi dışında gri, yoksa en kısıtlayıcı bölge. */
export type RiderZone = AreaType | (typeof RiderState)[keyof typeof RiderState];

export function riderZone(riding: boolean, currentAreas: AreaRef[]): RiderZone {
  if (!riding) return RiderState.IDLE;
  const types = currentAreas.map((a) => a.type);
  if (!types.includes(AreaType.SERVICE) && !types.includes(AreaType.NO_RIDE)) return RiderState.NONE;
  return dominantZone(types) ?? AreaType.SERVICE;
}
