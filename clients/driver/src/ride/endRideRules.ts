import { AreaType, type Area } from '@shared/api/types';
import type { LatLng } from '../geo/latlng';
import { areaToZone, distanceToZone, pointInZone, zonesOfType } from '../geo/zone';

/**
 * Sürüşün burada bitirilememe sebebi; bitirilebiliyorsa null.
 * Kural: sürüş sadece park alanlarında biter, park yasak bölgede hiç bitmez.
 * Konum yerel alan geometrisiyle kontrol edilir, sunucuya sormaya gerek kalmaz.
 */
export function endRideBlocker(here: LatLng, areas: Area[]): string | null {
  if (zonesOfType(areas, AreaType.NO_PARKING).some((z) => pointInZone(here, z))) {
    return 'Park yasak bölgede sürüş bitirilemez. Bir park alanına gidin.';
  }
  const parkings = areas.filter((a) => a.type === AreaType.PARKING);
  if (parkings.some((a) => pointInZone(here, areaToZone(a)))) return null;

  const nearest = parkings
    .map((a) => ({ name: a.name, meters: distanceToZone(here, areaToZone(a)) }))
    .sort((x, y) => x.meters - y.meters)[0];
  if (!nearest) return 'Sürüş sadece park alanlarında bitirilebilir; tanımlı park alanı yok.';
  const rounded = Math.max(10, Math.round(nearest.meters / 10) * 10);
  return `Sürüş sadece park alanlarında bitirilebilir. En yakın park alanı: ${nearest.name}, yaklaşık ${rounded} m.`;
}
