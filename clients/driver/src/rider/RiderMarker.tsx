import { useEffect, useMemo, useRef, type RefObject } from 'react';
import L from 'leaflet';
import { Marker } from 'react-leaflet';
import { SNAP_METERS } from '../config';
import type { LatLng } from '../geo/latlng';
import type { Restrictions, RoadNetwork } from '../roads/RoadNetwork';
import type { RiderZone } from './riderZone';

// Tek ikon: rengi değiştirmek için ikonu yenilemek Leaflet'te sürüklemeyi keser,
// bu yüzden bölge bilgisi elemana data-zone olarak yazılır.
const RIDER_ICON = L.divIcon({
  className: 'rider',
  html: '<span></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

interface Props {
  position: LatLng;
  zone: RiderZone;
  draggable: boolean;
  roads: RoadNetwork | null;
  restrictions: Restrictions | null;
  /** Sürüklerken güncellenen canlı konum (GPS örnekleyici buradan okur). */
  live: RefObject<LatLng>;
  /** Sürüklerken canlı konum her değiştiğinde (bölge sınırı kontrolü için). */
  onDrag: (p: LatLng) => void;
  onDragEnd: () => void;
}

/**
 * Scooter imleci. Sürüklenirken yol üzerinde kayar (en yakın yola yapışır) ve sürüş yasak
 * bölgeye girmez; bölgeye girmeden önceki son yol noktasında kalır.
 */
export function RiderMarker({ position, zone, draggable, roads, restrictions, live, onDrag, onDragEnd }: Props) {
  const markerRef = useRef<L.Marker | null>(null);
  // Sürükleme işleyicileri güncel değerleri ref'ten okur; her render'da yeniden bağlanmaz.
  const latest = useRef({ zone, roads, restrictions });
  latest.current = { zone, roads, restrictions };

  // Yeni dizi her render'da konumu sıfırlardı; sadece konum değişince değişsin.
  const markerPosition = useMemo<[number, number]>(() => [position.lat, position.lng], [position]);

  // Harita marker'ı ilk render'dan sonra oluşturur; bu yüzden hem değişince hem de "add" olayında uygulanır.
  useEffect(() => {
    const el = markerRef.current?.getElement();
    if (el) el.dataset.zone = zone;
  }, [zone]);

  const eventHandlers = useMemo(
    () => ({
      add: (e: L.LeafletEvent) => {
        const el = (e.target as L.Marker).getElement();
        if (el) el.dataset.zone = latest.current.zone;
      },
      drag: (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const { roads: network, restrictions: r } = latest.current;
        if (!network) {
          live.current = marker.getLatLng();
        } else {
          const snap = network.snap(marker.getLatLng(), SNAP_METERS);
          if (snap && r && network.zoneAt(snap.point, r) >= 0) {
            marker.setLatLng(live.current);
          } else if (snap) {
            live.current = snap.point;
            marker.setLatLng(snap.point);
          }
        }
        onDrag(live.current);
      },
      dragend: () => {
        // Yakında yol yoksa son yol noktasında kalır.
        markerRef.current?.setLatLng(live.current);
        onDragEnd();
      },
    }),
    [live, onDrag, onDragEnd],
  );

  return (
    <Marker
      ref={markerRef}
      position={markerPosition}
      icon={RIDER_ICON}
      draggable={draggable}
      keyboard={false}
      eventHandlers={eventHandlers}
    />
  );
}
