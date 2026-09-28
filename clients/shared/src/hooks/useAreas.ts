import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Area } from '../api/types';
import { SocketEvent } from '../realtime/events';
import { getSocket } from '../realtime/socket';

let cache: Promise<Area[]> | null = null;
/**
 * Süren yenileme: alan kaydedilince ekranın reload'u ile sunucunun duyurusu (areas-changed)
 * aynı anda yenileme ister; ikisi tek GET /areas isteğinde birleşir.
 */
let refreshing: Promise<Area[]> | null = null;

function fetchAreas(force: boolean): Promise<Area[]> {
  if (force && refreshing) return refreshing;
  if (force || !cache) {
    const request = api.areas();
    cache = request;
    refreshing = request;
    const done = () => {
      if (refreshing === request) refreshing = null;
    };
    request.then(done, done);
  }
  return cache;
}

/**
 * Alanları bir kez çeker; ekranlar arası geçişte tekrar istek atmaz. Başka bir istemci
 * (operasyon) yeni alan oluşturduğunda sunucunun duyurusuyla kendiliğinden yenilenir.
 */
export function useAreas() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((force = false) => {
    fetchAreas(force).then(
      (list) => {
        setAreas(list);
        setError(null);
      },
      (err: Error) => {
        cache = null;
        setError(err.message);
      },
    );
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    const onChanged = () => load(true);
    socket.on(SocketEvent.AREAS_CHANGED, onChanged);
    return () => {
      socket.off(SocketEvent.AREAS_CHANGED, onChanged);
    };
  }, [load]);

  return { areas, error, reload: () => load(true) };
}
