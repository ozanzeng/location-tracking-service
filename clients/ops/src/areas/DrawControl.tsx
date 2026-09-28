import { useEffect, useState } from 'react';
import L from 'leaflet';
import type { Polygon as GeoPolygon } from 'geojson';
import { useMap } from 'react-leaflet';

/** Haritada çizilmiş, henüz kaydedilmemiş alan. */
export interface Draft {
  layer: L.Layer;
  geometry: GeoPolygon;
}

/**
 * Çizim aracı (leaflet-geoman) sadece bu ekranda gerekli; ana pakete girmesin diye
 * ekran açıldığında yüklenir.
 */
export function DrawControl({
  onDraw,
  drafting,
  onReady,
}: {
  onDraw: (d: Draft) => void;
  drafting: boolean;
  /** Araç yüklendi: şekil düzenleme (EditShape) bundan sonra kullanılabilir. */
  onReady?: () => void;
}) {
  const map = useMap();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      import('@geoman-io/leaflet-geoman-free'),
      import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'),
    ]).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Geoman sadece kendisinden sonra oluşturulan haritalara bağlanır; harita önceden
    // oluştuğu için bu haritaya elle bağla.
    if (!map.pm) {
      const PM = (L as unknown as { PM: { Map: new (m: L.Map) => L.PM.PMMap } }).PM;
      map.pm = new PM.Map(map);
    }
    map.pm.setLang('tr');
    map.pm.addControls({
      position: 'topleft',
      drawPolygon: true,
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: true,
      drawCircle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
      editMode: true,
      dragMode: false,
      removalMode: false,
    });
    map.pm.setGlobalOptions({ allowSelfIntersection: false, pathOptions: { color: '#1F5FAD', weight: 2 } });
    onReady?.();

    const onCreate = (e: { layer: L.Layer }) => {
      const layer = e.layer as L.Polygon;
      onDraw({ layer, geometry: layer.toGeoJSON().geometry as GeoPolygon });
      // Düzenleme sonrası geometriyi güncel tut.
      layer.on('pm:edit', () => onDraw({ layer, geometry: layer.toGeoJSON().geometry as GeoPolygon }));
    };
    map.on('pm:create', onCreate);
    return () => {
      map.off('pm:create', onCreate);
      map.pm.removeControls();
    };
  }, [ready, map, onDraw, onReady]);

  // Taslak varken ikinci bir çizime izin verme.
  useEffect(() => {
    if (!ready) return;
    map.pm.Toolbar.setButtonDisabled('drawPolygon', drafting);
    map.pm.Toolbar.setButtonDisabled('drawRectangle', drafting);
  }, [ready, drafting, map]);

  return null;
}
