import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@shared/api/client';
import { EventType, type AreaEvent, type LogEntry } from '@shared/api/types';
import { SocketEvent } from '@shared/realtime/events';
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
    // Sadece giriş/çıkış olayları: tüm filonun konum yayını (monitor) bu ekranda gereksiz.
    const join = () => socket.emit(SocketEvent.SUBSCRIBE, { events: true });
    const onEvent = (e: AreaEvent) => {
      if (e.eventType === EventType.ENTER) setNewEntries((n) => n + 1);
    };
    join();
    socket.on(SocketEvent.CONNECT, join);
    socket.on(SocketEvent.AREA_EVENT, onEvent);
    return () => {
      socket.off(SocketEvent.CONNECT, join);
      socket.off(SocketEvent.AREA_EVENT, onEvent);
      socket.emit(SocketEvent.UNSUBSCRIBE, { events: true });
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
