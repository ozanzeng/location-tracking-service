import type { Polygon as GeoPolygon } from 'geojson';

/** Haritada çizilmiş, henüz kaydedilmemiş alan. */
export interface Draft {
  layer: L.Layer;
  geometry: GeoPolygon;
}
