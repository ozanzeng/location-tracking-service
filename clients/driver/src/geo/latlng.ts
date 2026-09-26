export interface LatLng {
  lat: number;
  lng: number;
}

export const M_PER_DEG_LAT = 110_540;
export const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** İki nokta arası mesafe (m). Şehir ölçeğinde yeterince doğru, hızlı düzlem yaklaşımı. */
export function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  const dx = (lng2 - lng1) * mPerDegLng((lat1 + lat2) / 2);
  return Math.hypot(dx, dy);
}

export const distance = (a: LatLng, b: LatLng) => metersBetween(a.lat, a.lng, b.lat, b.lng);

export function pathLength(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distance(path[i - 1], path[i]);
  return total;
}

/** Çizginin başından `meters` kadar ilerideki nokta; çizgi bittiyse null. */
export function pointAlong(path: LatLng[], meters: number): LatLng | null {
  let remaining = meters;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const segment = distance(a, b);
    if (remaining <= segment) {
      const t = segment === 0 ? 0 : remaining / segment;
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    remaining -= segment;
  }
  return null;
}
