import { useEffect, type RefObject } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { api } from '@shared/api/client';
import type { AreaType, Position } from '@shared/api/types';
import { getSocket } from '@shared/realtime/socket';
import { scooterColor } from './scooterColor';

/**
 * "Aktif" = son 60 saniyede konum göndermiş. Cihazlar 5 sn'de bir gönderir; 15 sn sessiz
 * kalan soluklaşır (sürüş bitmiş, sekme kapanmış ya da bağlantı kopmuş olabilir),
 * 60 sn'de listeden düşer.
 */
export const IDLE_MS = 15_000;
export const ACTIVE_MS = 60_000;

export interface Scooter {
  marker: L.CircleMarker;
  types: AreaType[];
  seenAt: number;
}

export type Counts = { total: number } & Partial<Record<AreaType, number>>;

/**
 * Scooter'ları Leaflet katmanında doğrudan günceller: yüzlerce konum saniyede birkaç kez
 * değişirken React state'i kullanmak her seferinde tüm ağacı yeniden render ederdi.
 */
export function ScooterLayer({
  scooters,
  onCounts,
}: {
  scooters: RefObject<Map<string, Scooter>>;
  onCounts: (c: Counts) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    const all = scooters.current;

    const upsert = (userId: string, lat: number, lng: number, types: AreaType[], seenAt = Date.now()) => {
      const color = scooterColor(types);
      const existing = all.get(userId);
      if (existing) {
        existing.marker.setLatLng([lat, lng]).setStyle({ fillColor: color, fillOpacity: 1, opacity: 1 });
        existing.types = types;
        existing.seenAt = Math.max(existing.seenAt, seenAt);
        return;
      }
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      })
        .bindTooltip(userId, { direction: 'top', offset: [0, -6] })
        .addTo(layer);
      all.set(userId, { marker, types, seenAt });
    };

    const publishCounts = () => {
      const counts: Counts = { total: all.size };
      for (const s of all.values()) {
        for (const t of new Set(s.types)) counts[t] = (counts[t] ?? 0) + 1;
      }
      onCounts(counts);
    };

    let cancelled = false;
    // Açılışta sadece son 1 dakikada görülenler; "son görülme" konumun gerçek zamanı.
    api.latest(1).then(
      (list) => {
        if (cancelled) return;
        for (const p of list) {
          const seenAt = Date.parse(p.recordedAt);
          if (Date.now() - seenAt < ACTIVE_MS)
            upsert(
              p.userId,
              p.lat,
              p.lng,
              p.areas.map((a) => a.type),
              seenAt,
            );
        }
        publishCounts();
      },
      () => undefined,
    );

    const socket = getSocket();
    const join = () => socket.emit('subscribe', { monitor: true });
    const onPositions = (batch: Position[]) => {
      for (const p of batch)
        upsert(
          p.userId,
          p.lat,
          p.lng,
          p.areas.map((a) => a.type),
        );
    };
    join();
    socket.on('connect', join);
    socket.on('positions', onPositions);

    // Saniyede bir: sessiz kalanları soluklaştır, aktifliğini yitirenleri kaldır, sayaçları güncelle.
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [id, s] of all) {
        const silent = now - s.seenAt;
        if (silent > ACTIVE_MS) {
          s.marker.remove();
          all.delete(id);
        } else if (silent > IDLE_MS) {
          s.marker.setStyle({ fillOpacity: 0.35, opacity: 0.5 });
        }
      }
      publishCounts();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      socket.off('connect', join);
      socket.off('positions', onPositions);
      socket.emit('unsubscribe', { monitor: true });
      layer.remove();
      all.clear();
    };
  }, [map, scooters, onCounts]);

  return null;
}
