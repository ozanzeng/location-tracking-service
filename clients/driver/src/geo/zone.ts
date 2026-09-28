import type { Area, AreaType } from '@shared/api/types';
import { mPerDegLng } from './latlng';
import type { LatLng, Zone } from './geo.types';
import { M_PER_DEG_LAT } from './geo.constants';

/** GeoJSON [boylam, enlem] halkalarını bölgeye çevirir. */
export const areaToZone = (area: Area): Zone =>
  area.geometry.coordinates.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));

export const zonesOfType = (areas: Area[], type: AreaType): Zone[] =>
  areas.filter((a) => a.type === type).map(areaToZone);

/** Işın atma; deliklerin içindeki nokta bölgenin dışında sayılır. */
export function pointInZone(p: LatLng, zone: Zone): boolean {
  let inside = false;
  for (const ring of zone) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Noktanın bölgeye uzaklığı (m); içindeyse 0. */
export function distanceToZone(p: LatLng, zone: Zone): number {
  if (pointInZone(p, zone)) return 0;
  const kx = mPerDegLng(p.lat);
  let best = Infinity;
  for (const ring of zone) {
    for (let i = 1; i < ring.length; i++) {
      const ax = (ring[i - 1].lng - p.lng) * kx;
      const ay = (ring[i - 1].lat - p.lat) * M_PER_DEG_LAT;
      const dx = (ring[i].lng - p.lng) * kx - ax;
      const dy = (ring[i].lat - p.lat) * M_PER_DEG_LAT - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}
