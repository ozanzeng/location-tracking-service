import { useCallback, useEffect, useRef } from 'react';
import { api, ApiError } from '@shared/api/client';
import type { FleetChanged } from '@shared/api/types';
import { SocketEvent } from '@shared/realtime/events';
import { getSocket } from '@shared/realtime/socket';

/**
 * Kiralamanın hâlâ bu sürücüde olup olmadığını izler. Sunucu kiralamayı kendisi bitirebilir:
 * scooter uzun süre konum göndermezse (sinyal kaybı) worker kapatır ve scooter başka sürücülere
 * açılır. Bu scooter için filo duyurusu gelince ya da sunucu konumu kiralama yüzünden reddedince
 * (403/409) kontrol edilir.
 */
export function useRentalWatch(scooterId: string, onLost: () => void, onSessionExpired: () => void) {
  const handlers = useRef({ onLost, onSessionExpired });
  useEffect(() => {
    handlers.current = { onLost, onSessionExpired };
  });

  const check = useCallback(async () => {
    try {
      const rental = await api.currentRental();
      if (rental?.scooterId !== scooterId) handlers.current.onLost();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handlers.current.onSessionExpired();
      // Diğer hatalar (ağ): bir sonraki duyuruda ya da reddedilen konumda tekrar bakılır.
    }
  }, [scooterId]);

  useEffect(() => {
    const socket = getSocket();
    const onChanged = (message: FleetChanged) => {
      if (message.scooterId === scooterId) void check();
    };
    socket.on(SocketEvent.SCOOTERS_CHANGED, onChanged);
    return () => {
      socket.off(SocketEvent.SCOOTERS_CHANGED, onChanged);
    };
  }, [scooterId, check]);

  return check;
}
