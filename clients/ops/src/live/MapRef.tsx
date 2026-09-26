import { useEffect, type RefObject } from 'react';
import type L from 'leaflet';
import { useMap } from 'react-leaflet';

/** Harita örneğini dışarıdaki bir ref'e verir (ör. olay akışından scooter'a gitmek için). */
export function MapRef({ mapRef }: { mapRef: RefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
}
