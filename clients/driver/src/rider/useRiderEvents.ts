import { useCallback, useEffect, useState } from 'react';
import type { AreaEvent, AreaRef, Position } from '@shared/api/types';
import { SocketEvent } from '@shared/realtime/events';
import { getSocket } from '@shared/realtime/socket';
import { PLATE_MS } from '../config';
import type { PlateItem } from './SignPlate';

/**
 * Sunucudan bu scooter'a özel olaylar: bölge giriş/çıkış bildirimleri (levha olarak gösterilir)
 * ve işlenen son konuma göre içinde bulunulan bölgeler.
 */
export function useRiderEvents(scooterId: string) {
  const [plates, setPlates] = useState<PlateItem[]>([]);
  const [currentAreas, setCurrentAreas] = useState<AreaRef[]>([]);

  const dismiss = useCallback((key: string) => setPlates((list) => list.filter((p) => p.key !== key)), []);

  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit(SocketEvent.SUBSCRIBE, { userId: scooterId });
    const onEvent = (event: AreaEvent) => {
      if (event.userId !== scooterId) return;
      const plate: PlateItem = {
        key: `${event.logId}-${event.eventType}`,
        type: event.area.type,
        eventType: event.eventType,
        areaName: event.area.name,
      };
      setPlates((list) => [plate, ...list].slice(0, 3));
      setTimeout(() => dismiss(plate.key), PLATE_MS);
    };
    const onPosition = (p: Position) => {
      if (p.userId === scooterId) setCurrentAreas(p.areas);
    };
    join();
    socket.on(SocketEvent.CONNECT, join);
    socket.on(SocketEvent.AREA_EVENT, onEvent);
    socket.on(SocketEvent.POSITION, onPosition);
    return () => {
      socket.off(SocketEvent.CONNECT, join);
      socket.off(SocketEvent.AREA_EVENT, onEvent);
      socket.off(SocketEvent.POSITION, onPosition);
      socket.emit(SocketEvent.UNSUBSCRIBE, { userId: scooterId });
    };
  }, [scooterId, dismiss]);

  return { plates, dismiss, currentAreas };
}
