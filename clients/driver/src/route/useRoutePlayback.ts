import { useEffect, useRef, useState } from 'react';
import { PLAYBACK_TICK_MS } from '../config';
import { pointAlong } from '../geo/latlng';
import type { LatLng } from '../geo/geo.types';

/**
 * Rotayı oynatır: konum çizgi boyunca seçilen hızla ilerler. Konumu göndermek GPS
 * örnekleyicinin işi; burası sadece scooter'ı hareket ettirir.
 */
export function useRoutePlayback(path: LatLng[], speedKmh: number, onMove: (p: LatLng) => void, onFinish: () => void) {
  const [playing, setPlaying] = useState(false);
  // Oynatma sırasında rota ve hız kilitli; güncel değerler ref'ten okunur, sadece başlat/durdur tetikler.
  const latest = useRef({ path, speedKmh, onMove, onFinish });
  latest.current = { path, speedKmh, onMove, onFinish };

  useEffect(() => {
    if (!playing) return;
    const { path: line, speedKmh: speed } = latest.current;
    const metersPerTick = (speed / 3.6) * (PLAYBACK_TICK_MS / 1000);
    let traveled = 0;
    const timer = setInterval(() => {
      traveled += metersPerTick;
      const next = pointAlong(line, traveled);
      latest.current.onMove(next ?? line[line.length - 1]);
      if (!next) {
        setPlaying(false);
        latest.current.onFinish();
      }
    }, PLAYBACK_TICK_MS);
    return () => clearInterval(timer);
  }, [playing]);

  return { playing, toggle: () => setPlaying((p) => !p) };
}
