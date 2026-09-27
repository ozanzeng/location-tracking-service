import { AreaType } from '@shared/api/types';
import { dominantZone } from '@shared/zones/zoneStyles';

/**
 * Hizmet bölgesi dışında mı? Sürüş yasak bölge hizmet bölgesinin dışına taşabilir; orada
 * duran scooter "yasak bölgede" sayılır (kırmızı), "hizmet dışı" (gri) değil. Harita rengi
 * ve sayaç aynı kuralı kullanır.
 */
export function isOutsideService(types: Iterable<AreaType>): boolean {
  const set = new Set(types);
  return !set.has(AreaType.SERVICE) && !set.has(AreaType.NO_RIDE);
}

/** Scooter noktasının rengi: içinde bulunduğu en kısıtlayıcı bölge; hizmet bölgesi dışı gri. */
export function scooterColor(types: Iterable<AreaType>): string {
  const set = new Set(types);
  if (isOutsideService(set)) return '#8A8F98';
  const zone = dominantZone(set);
  if (zone === AreaType.NO_RIDE) return '#D7263D';
  if (zone === AreaType.SLOW) return '#F2A900';
  if (zone === AreaType.PARKING) return '#1F5FAD';
  return '#2B2F36';
}
