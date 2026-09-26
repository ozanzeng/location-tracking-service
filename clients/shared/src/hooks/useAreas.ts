import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Area } from '../api/types';
import { getSocket } from '../realtime/socket';

let cache: Promise<Area[]> | null = null;

/**
 * Alanları bir kez çeker; ekranlar arası geçişte tekrar istek atmaz. Başka bir istemci
 * (operasyon) yeni alan oluşturduğunda sunucunun duyurusuyla kendiliğinden yenilenir.
 */
export function useAreas() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((force = false) => {
    if (force || !cache) cache = api.areas();
    cache.then(
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
    socket.on('areas-changed', onChanged);
    return () => {
      socket.off('areas-changed', onChanged);
    };
  }, [load]);

  return { areas, error, reload: () => load(true) };
}
