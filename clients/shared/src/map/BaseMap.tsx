import type { ReactNode } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { ZoomButtons } from './ZoomButtons';
import { MAP_CENTER } from '../config';

/**
 * OpenStreetMap altlığı; CSS ile griye çekilir (styles.css).
 * Yakınlaştırma sadece +/- düğmeleriyle (ve klavyeyle): fare tekerleği, çift tıklama ve
 * Shift+sürükle kapalı; sayfayı kaydırırken ya da rota çizerken harita istemeden zoom yapmasın.
 * Dokunmatik ekranda iki parmakla yakınlaştırma açık kalır.
 */
export function BaseMap({ children }: { children?: ReactNode }) {
  return (
    <MapContainer
      center={MAP_CENTER}
      zoom={15}
      preferCanvas
      className="map"
      zoomControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      boxZoom={false}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      {/* Sol üstte çizim araçları, ortada sürücü bildirimleri var; düğmeler sağ üstte. */}
      <ZoomButtons />
      {children}
    </MapContainer>
  );
}
