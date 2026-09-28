import { useEffect } from 'react';
import L from 'leaflet';
import type { Polygon as GeoPolygon } from 'geojson';
import { useMap } from 'react-leaflet';
import type { Area } from '@shared/api/types';

/**
 * Düzenlenen alanın şekli: köşeler sürüklenir, kenar ortasından yeni köşe eklenir. Her
 * değişiklikte yeni geometri bildirilir. Çizim aracı (Geoman) DrawControl'de yüklenmiş olmalı
 * (`ready`); katman ondan sonra oluşturulur ki düzenleme özelliği bağlansın.
 */
export function EditShape({
  area,
  ready,
  onChange,
}: {
  area: Area;
  ready: boolean;
  onChange: (geometry: GeoPolygon) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!ready) return;
    const rings = area.geometry.coordinates.map((ring) =>
      // GeoJSON halkası kapalıdır (son nokta = ilk); Leaflet açık halka ister.
      ring.slice(0, -1).map(([lng, lat]) => [lat, lng] as [number, number]),
    );
    const layer = L.polygon(rings, { color: '#1F5FAD', weight: 2, dashArray: '6 4' }).addTo(map);
    layer.pm.enable({ allowSelfIntersection: false });
    const emit = () => onChange(layer.toGeoJSON().geometry as GeoPolygon);
    layer.on('pm:edit', emit);
    map.fitBounds(layer.getBounds(), { maxZoom: 17, padding: [40, 40] });
    return () => {
      layer.off('pm:edit', emit);
      layer.pm.disable();
      layer.remove();
    };
  }, [area, ready, map, onChange]);

  return null;
}
