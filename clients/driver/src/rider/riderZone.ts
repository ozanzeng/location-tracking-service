import { AreaType, type AreaRef } from '@shared/api/types';
import { RiderState, type RiderZone } from './rider.types';
import { dominantZone } from '@shared/zones/dominantZone';

export function riderZone(riding: boolean, currentAreas: AreaRef[]): RiderZone {
  if (!riding) return RiderState.IDLE;
  const types = currentAreas.map((a) => a.type);
  if (!types.includes(AreaType.SERVICE) && !types.includes(AreaType.NO_RIDE)) return RiderState.NONE;
  return dominantZone(types) ?? AreaType.SERVICE;
}
