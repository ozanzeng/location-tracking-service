import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@shared/api/client';
import type { AreaEvent, LogEntry } from '@shared/api/types';
import { getSocket } from '@shared/realtime/socket';
import { toLogQuery, type LogFilters } from './logFilters';

/**
 * GET /logs ile sayfalı giriş kayıtları. Liste açıkken gelen yeni girişler sayılır;
 * kullanıcı istediğinde yenilenir (liste kendiliğinden kaymaz).
 * Yanıtlar farklı sırayla dönebilir: sadece en son başlatılan isteğin sonucu uygulanır.
 * Böylece eski filtrenin geç gelen yanıtı ya da filtre değişmeden önce istenen sonraki
 * sayfa, yeni filtrenin sonucunu ezmez.
 */
export function useLogs(filters: LogFilters) {
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEntries, setNewEntries] = useState(0);
  const latest = useRef(0);

  const load = useCallback(async (f: LogFilters, after?: string) => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const page = await api.logs({ ...toLogQuery(f), cursor: after });
      if (id !== latest.current) return;
      setRows((current) => (after ? [...current, ...page.data] : page.data));
      setCursor(page.nextCursor);
      if (!after) setNewEntries(0);
    } catch (err) {
      if (id === latest.current) setError((err as Error).message);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit('subscribe', { monitor: true });
    const onEvent = (e: AreaEvent) => {
      if (e.eventType === 'ENTER') setNewEntries((n) => n + 1);
    };
    join();
    socket.on('connect', join);
    socket.on('area-event', onEvent);
    return () => {
      socket.off('connect', join);
      socket.off('area-event', onEvent);
      socket.emit('unsubscribe', { monitor: true });
    };
  }, []);

  return {
    rows,
    loading,
    error,
    newEntries,
    hasMore: cursor !== null,
    reload: () => void load(filters),
    // Bir yükleme sürerken sonraki sayfa istenmez: imleç eski sonuca ait olabilir.
    loadMore: () => cursor && !loading && void load(filters, cursor),
  };
}
