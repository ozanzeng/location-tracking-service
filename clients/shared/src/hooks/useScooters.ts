import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { FleetChanged, Scooter } from '../api/types';
import { SCOOTERS_FALLBACK_REFRESH_MS } from '../config';
import { SocketEvent } from '../realtime/events';
import { getSocket } from '../realtime/socket';

/**
 * Filo ve durumları. Scooter kiralanınca, bırakılınca, eklenince ya da silinince sunucu
 * duyurur ve liste hemen yenilenir; bağlantı gelince ve yedek olarak periyodik de yenilenir.
 * Aynı anda tek istek: süren istek varken gelen duyurular bittiğinde bir kez daha istenir.
 */
export function useScooters(enabled = true) {
  const [scooters, setScooters] = useState<Scooter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        setScooters(await api.scooters());
        setError(null);
      } while (again.current);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const onChanged = (_message: FleetChanged) => void refresh();
    const onConnect = () => void refresh();
    socket.on(SocketEvent.SCOOTERS_CHANGED, onChanged);
    socket.on(SocketEvent.CONNECT, onConnect);
    const timer = setInterval(() => void refresh(), SCOOTERS_FALLBACK_REFRESH_MS);
    void refresh();
    return () => {
      socket.off(SocketEvent.SCOOTERS_CHANGED, onChanged);
      socket.off(SocketEvent.CONNECT, onConnect);
      clearInterval(timer);
    };
  }, [enabled, refresh]);

  return { scooters, error, refresh };
}
