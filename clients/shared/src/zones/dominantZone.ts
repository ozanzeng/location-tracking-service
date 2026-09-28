import { AreaType } from '../api/types';
import { ZONE_ORDER } from './zoneStyles';

/** Scooter'ın rengini içinde bulunduğu en kısıtlayıcı bölge belirler. */
export function dominantZone(types: Iterable<AreaType>): AreaType | null {
  const set = new Set(types);
  return ZONE_ORDER.find((t) => set.has(t)) ?? null;
}
