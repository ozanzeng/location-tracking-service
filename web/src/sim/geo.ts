export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** İki nokta arası mesafe (metre, haversine). */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rotanın başından `meters` kadar ilerideki nokta; rota bittiyse null. */
export function pointAlong(route: LatLng[], meters: number): LatLng | null {
  let remaining = meters;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const segment = distance(a, b);
    if (remaining <= segment) {
      const t = segment === 0 ? 0 : remaining / segment;
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    remaining -= segment;
  }
  return null;
}

/** Başlangıç noktasından yön (derece) ve mesafeye göre yeni nokta (kısa mesafe yaklaşımı). */
export function move(from: LatLng, headingDeg: number, meters: number): LatLng {
  const dLat = (meters * Math.cos(rad(headingDeg))) / 111_320;
  const dLng = (meters * Math.sin(rad(headingDeg))) / (111_320 * Math.cos(rad(from.lat)));
  return { lat: from.lat + dLat, lng: from.lng + dLng };
}
