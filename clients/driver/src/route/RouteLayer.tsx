import { memo, useMemo } from 'react';
import { CircleMarker, Polyline } from 'react-leaflet';
import type { LatLng } from '../geo/geo.types';
import { ROUTE_LINE_STYLE, ROUTE_STOP_STYLE, ROUTE_STOP_REMOVE_STYLE } from './route.constants';

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
      {line.length ? <Polyline positions={line} interactive={false} pathOptions={ROUTE_LINE_STYLE} /> : null}
      {stops.map((stop, i) => (
        <CircleMarker
          key={`${stop.lat},${stop.lng}`}
          center={[stop.lat, stop.lng]}
          radius={hoveredStop === i ? 8 : 5}
          interactive={false}
          pathOptions={hoveredStop === i ? ROUTE_STOP_REMOVE_STYLE : ROUTE_STOP_STYLE}
        />
      ))}
    </>
  );
});
