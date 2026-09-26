import { useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import { CircleMarker, useMapEvents } from 'react-leaflet';
import { SAME_STOP_METERS, SNAP_METERS, STOP_HIT_PX } from '../config';
import type { LatLng } from '../geo/latlng';
import type { Restrictions, RoadNetwork, Snap } from '../roads/RoadNetwork';

interface Props {
  roads: RoadNetwork;
  restrictions: Restrictions | null;
  stops: LatLng[];
  onAdd: (snap: Snap) => void;
  onRemove: (index: number) => void;
  onHoverStop: (index: number | null) => void;
}

/**
 * Rota çizimi: fare gezerken yoldaki hedef noktayı önizler, tıklanınca durak ekler.
 * Var olan bir durağa (ya da aynı yol noktasına) tekrar tıklamak o durağı siler.
 * Yakında yol yoksa imleç "izin yok"a döner; yasak bölgedeki önizleme kırmızıdır.
 */
export function RouteDrawing({ roads, restrictions, stops, onAdd, onRemove, onHoverStop }: Props) {
  const [preview, setPreview] = useState<{ point: LatLng; blocked: boolean } | null>(null);
  const frame = useRef(0);

  /** İmlecin üzerinde olduğu durak (ekranda STOP_HIT_PX içinde). */
  const stopAt = (point: L.Point): number | null => {
    let hit: number | null = null;
    let best = STOP_HIT_PX;
    stops.forEach((stop, i) => {
      const d = map.latLngToContainerPoint(stop).distanceTo(point);
      if (d <= best) {
        best = d;
        hit = i;
      }
    });
    return hit;
  };

  const map = useMapEvents({
    mousemove: (e) => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const container = map.getContainer();
        const onStop = stopAt(e.containerPoint);
        onHoverStop(onStop);
        container.classList.toggle('map--onstop', onStop !== null);
        const snap = onStop === null ? roads.snap(e.latlng, SNAP_METERS) : null;
        const blocked = snap && restrictions ? roads.zoneAt(snap.point, restrictions) >= 0 : false;
        setPreview(snap ? { point: snap.point, blocked } : null);
        // Önizleme canvas'ta çizilir; durumu erişilebilirlik/test için elemanda da tutulur.
        container.dataset.preview = snap ? (blocked ? 'blocked' : 'road') : 'none';
        container.classList.toggle('map--nosnap', onStop === null && !snap);
      });
    },
    mouseout: () => {
      cancelAnimationFrame(frame.current);
      setPreview(null);
      onHoverStop(null);
    },
    click: (e) => {
      // Durak eklendi/silindi; önizleme bir sonraki fare hareketinde yeniden hesaplanır.
      setPreview(null);
      const onStop = stopAt(e.containerPoint);
      if (onStop !== null) {
        onRemove(onStop);
        onHoverStop(null);
        return;
      }
      const snap = roads.snap(e.latlng, SNAP_METERS);
      if (!snap) return;
      const same = stops.findIndex((stop) => map.distance(stop, snap.point) <= SAME_STOP_METERS);
      if (same !== -1) onRemove(same);
      else onAdd(snap);
    },
  });

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      map.getContainer().classList.remove('map--nosnap', 'map--onstop');
    },
    [map],
  );

  return preview ? (
    <CircleMarker
      center={[preview.point.lat, preview.point.lng]}
      radius={6}
      interactive={false}
      pathOptions={{ color: preview.blocked ? '#D7263D' : '#1F5FAD', weight: 3, fillColor: '#fff', fillOpacity: 1 }}
    />
  ) : null;
}
