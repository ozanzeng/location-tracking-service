import type { LatLng } from '../geo/geo.types';

/** p→q parçasının r→s ile kesiştiği yer (p→q üzerinde 0..1) ya da null. */
export function intersect(p: LatLng, q: LatLng, r: LatLng, s: LatLng): number | null {
  const d1x = q.lng - p.lng;
  const d1y = q.lat - p.lat;
  const d2x = s.lng - r.lng;
  const d2y = s.lat - r.lat;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-18) return null;
  const t = ((r.lng - p.lng) * d2y - (r.lat - p.lat) * d2x) / denom;
  const u = ((r.lng - p.lng) * d1y - (r.lat - p.lat) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
