import { useEffect, type RefObject } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { api } from '@shared/api/client';
import type { Position } from '@shared/api/types';
import { SocketEvent } from '@shared/realtime/events';
import { getSocket } from '@shared/realtime/socket';
import { SCOOTER_ACTIVE_MS as ACTIVE_MS, SCOOTER_REFRESH_MS } from '../config';
import { scooterColor } from './scooterColor';
import { countScooters } from './scooterCounts';
import { isNewerPosition, sameCounts, silence } from './scooterState';
import type { Scooter, Counts } from './live.types';
import { LIVE_STYLE, FADED_STYLE } from './live.constants';

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

    const upsert = (p: Position, seenAt = Date.now()) => {
      const recordedAt = Date.parse(p.recordedAt);
      const existing = all.get(p.userId);
      if (existing) {
        existing.seenAt = Math.max(existing.seenAt, seenAt);
        // Eski konum (ör. geç gelen ilk yükleme) reddedilir; renk vb. ancak ondan sonra hesaplanır.
        if (!isNewerPosition(existing.recordedAt, recordedAt)) return;
      }
      const types = p.areas.map((a) => a.type);
      const color = scooterColor(types);
      if (existing) {
        existing.marker.setLatLng([p.lat, p.lng]).setStyle({ fillColor: color, ...LIVE_STYLE });
        existing.types = types;
        existing.recordedAt = recordedAt;
        existing.faded = false;
        return;
      }
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: color,
        ...LIVE_STYLE,
      })
        .bindTooltip(p.userId, { direction: 'top', offset: [0, -6] })
        .addTo(layer);
      all.set(p.userId, { marker, types, seenAt, recordedAt, faded: false });
    };

    let lastCounts: Counts | null = null;
    const publishCounts = () => {
      const counts = countScooters(all.values());
      if (sameCounts(lastCounts, counts)) return;
      lastCounts = counts;
      onCounts(counts);
    };

    let cancelled = false;
    // Açılışta sadece son 1 dakikada görülenler; "son görülme" konumun gerçek zamanı.
    api.latest(1).then(
      (list) => {
        if (cancelled) return;
        for (const p of list) {
          const seenAt = Date.parse(p.recordedAt);
          if (Date.now() - seenAt < ACTIVE_MS) upsert(p, seenAt);
        }
        publishCounts();
      },
      () => undefined,
    );

    const socket = getSocket();
    const join = () => socket.emit(SocketEvent.SUBSCRIBE, { monitor: true });
    const onPositions = (batch: Position[]) => {
      for (const p of batch) upsert(p);
    };
    join();
    socket.on(SocketEvent.CONNECT, join);
    socket.on(SocketEvent.POSITIONS, onPositions);

    // Saniyede bir: sessiz kalanları soluklaştır, aktifliğini yitirenleri kaldır, sayaçları güncelle.
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [id, s] of all) {
        const state = silence(now, s.seenAt);
        if (state === 'gone') {
          s.marker.remove();
          all.delete(id);
        } else if (state === 'idle' && !s.faded) {
          s.marker.setStyle(FADED_STYLE);
          s.faded = true;
        }
      }
      publishCounts();
    }, SCOOTER_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      socket.off(SocketEvent.CONNECT, join);
      socket.off(SocketEvent.POSITIONS, onPositions);
      socket.emit(SocketEvent.UNSUBSCRIBE, { monitor: true });
      layer.remove();
      all.clear();
    };
  }, [map, scooters, onCounts]);

  return null;
}
