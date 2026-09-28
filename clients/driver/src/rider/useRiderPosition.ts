import { useCallback, useRef, useState } from 'react';
import type { LatLng } from '../geo/geo.types';

/**
 * Scooter'ın konumu iki katmanlı tutulur: `live` sürükleme ve oynatma sırasında her karede
 * değişir (GPS örnekleyici buradan okur, render tetiklemez); `position` ekrana yansıyan,
 * hareket bitince güncellenen değerdir.
 */
export function useRiderPosition(initial: LatLng) {
  const [position, setPosition] = useState(initial);
  const live = useRef(initial);
  const moveTo = useCallback((p: LatLng) => {
    live.current = p;
    setPosition(p);
  }, []);
  return { position, live, moveTo };
}
