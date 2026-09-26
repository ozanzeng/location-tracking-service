import { useCallback, useEffect, useState } from 'react';
import { api, type Area } from './api';

let cache: Promise<Area[]> | null = null;

/** Alanları bir kez çeker; ekranlar arası geçişte tekrar istek atmaz. */
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

  useEffect(() => load(), [load]);

  return { areas, error, reload: () => load(true) };
}
