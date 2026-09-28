export interface LatLng {
  lat: number;
  lng: number;
}

/** Halkalar: ilki dış sınır, sonrakiler delikler (GeoJSON Polygon gibi). */
export type Zone = LatLng[][];
