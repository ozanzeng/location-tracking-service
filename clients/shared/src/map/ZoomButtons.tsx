import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

/**
 * Harita yakınlaştırma düğmeleri. Leaflet animasyon sürerken gelen zoom isteğini yok
 * sayar; hızlı art arda tıklamalar kaybolmasın diye hedef seviye biriktirilir ve
 * animasyon bitince kalan adım uygulanır.
 */
export function ZoomButtons() {
  const map = useMap();
  const container = useRef<HTMLDivElement>(null);
  const target = useRef<number | null>(null);
  const [zoom, setZoom] = useState(() => map.getZoom());

  useEffect(() => {
    // Düğmelere tıklamak haritaya tıklama sayılmasın (rota çizerken durak eklemesin).
    if (container.current) {
      L.DomEvent.disableClickPropagation(container.current);
      L.DomEvent.disableScrollPropagation(container.current);
    }
    const onZoomEnd = () => {
      setZoom(map.getZoom());
      if (target.current !== null && target.current !== map.getZoom()) map.setZoom(target.current);
      else target.current = null;
    };
    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('zoomend', onZoomEnd);
    };
  }, [map]);

  const step = (delta: number) => {
    const from = target.current ?? map.getZoom();
    target.current = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), from + delta));
    map.setZoom(target.current);
  };

  return (
    <div ref={container} className="zoom-buttons" role="group" aria-label="Harita yakınlaştırma">
      <button
        type="button"
        onClick={() => step(1)}
        disabled={zoom >= map.getMaxZoom()}
        aria-label="Yakınlaştır"
        title="Yakınlaştır"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={zoom <= map.getMinZoom()}
        aria-label="Uzaklaştır"
        title="Uzaklaştır"
      >
        −
      </button>
    </div>
  );
}
