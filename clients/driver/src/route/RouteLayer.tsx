import { memo, useMemo } from 'react';
import { CircleMarker, Polyline } from 'react-leaflet';
import type { LatLng } from '../geo/latlng';

const LINE = { color: '#1F5FAD', weight: 4, opacity: 0.85, lineCap: 'round', lineJoin: 'round' } as const;
const STOP = { color: '#1F5FAD', weight: 2, fillColor: '#1F5FAD', fillOpacity: 1 };
const STOP_TO_REMOVE = { color: '#fff', weight: 2, fillColor: '#D7263D', fillOpacity: 1 };

/**
 * Planlanan rota çizgisi ve duraklar; silinecek durak (üzerine gelinmiş) kırmızı ve büyük.
 * memo: oynatmada ekran her adımda çizilir, rota ise değişmez.
 */
export const RouteLayer = memo(function RouteLayer({
  path,
  stops,
  hoveredStop,
}: {
  path: LatLng[];
  stops: LatLng[];
  hoveredStop: number | null;
}) {
  const line = useMemo(() => path.map((p) => [p.lat, p.lng] as [number, number]), [path]);
  return (
    <>
      {line.length ? <Polyline positions={line} interactive={false} pathOptions={LINE} /> : null}
      {stops.map((stop, i) => (
        <CircleMarker
          key={`${stop.lat},${stop.lng}`}
          center={[stop.lat, stop.lng]}
          radius={hoveredStop === i ? 8 : 5}
          interactive={false}
          pathOptions={hoveredStop === i ? STOP_TO_REMOVE : STOP}
        />
      ))}
    </>
  );
});
