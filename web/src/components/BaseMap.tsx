import type { ReactNode } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';

export const KADIKOY: [number, number] = [40.984, 29.035];

/** OpenStreetMap altlığı; CSS ile griye çekilir (styles.css). */
export function BaseMap({ children }: { children?: ReactNode }) {
  return (
    <MapContainer center={KADIKOY} zoom={15} preferCanvas className="map" zoomControl={false}>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      {children}
    </MapContainer>
  );
}
