import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@shared/api/client';
import type { LocationPoint } from '@shared/api/types';

const MAX_BATCH = 100;
/** Çok uzun kopukluklarda belleği korumak için en eski noktalar atılır. */
const MAX_QUEUE = 2000;
const NETWORK_RETRY_MS = 5000;

export type LogKind = 'sent' | 'queued' | 'wait' | 'error';

export interface DeviceLogEntry {
  id: number;
  at: Date;
  kind: LogKind;
  text: string;
  requestId?: string | null;
}

/**
 * Cihazın gönderim kuyruğu. Konumlar önce sıraya girer, ardından gönderilir:
 * tek nokta POST /locations, birikmiş noktalar POST /locations/batch ile gider.
 * Ağ hatasında noktalar kaybolmaz; 429/503'te sunucunun Retry-After süresine uyulur.
 * 400'de sadece sunucunun tek başına reddettiği nokta atılır.
 */
export function useOutbox(online: boolean) {
  const queue = useRef<LocationPoint[]>([]);
  const inFlight = useRef(false);
  const retryAt = useRef(0);
  /**
   * 400'de grup ikiye bölünür, tek başına reddedilen nokta bulunana kadar küçülür;
   * o nokta atılınca tam boyuta döner.
   */
  const batchLimit = useRef(MAX_BATCH);
  const nextLogId = useRef(0);
  const [pending, setPending] = useState(0);
  const [log, setLog] = useState<DeviceLogEntry[]>([]);

  const addLog = useCallback((kind: LogKind, text: string, requestId?: string | null) => {
    const entry = { id: nextLogId.current++, at: new Date(), kind, text, requestId };
    setLog((list) => [entry, ...list].slice(0, 40));
  }, []);

  const record = useCallback(
    (point: LocationPoint) => {
      queue.current.push(point);
      if (queue.current.length > MAX_QUEUE) queue.current.splice(0, queue.current.length - MAX_QUEUE);
      setPending(queue.current.length);
      if (!online) addLog('queued', `Çevrimdışı: konum sıraya alındı (${queue.current.length} bekliyor)`);
    },
    [online, addLog],
  );

  /**
   * Gönderilen noktalar kuyruktan kimlikleriyle çıkarılır, konumlarıyla değil: gönderim
   * sürerken kuyruk MAX_QUEUE'yu aşıp baştan kırpılırsa ilk N eleman artık gönderilenler değildir.
   */
  const remove = useCallback((points: LocationPoint[]) => {
    const sent = new Set(points);
    queue.current = queue.current.filter((p) => !sent.has(p));
  }, []);

  const flush = useCallback(async () => {
    if (inFlight.current || !online || Date.now() < retryAt.current || queue.current.length === 0) return;
    inFlight.current = true;
    const batch = queue.current.slice(0, batchLimit.current);
    try {
      const { requestId } = await api.sendLocations(batch);
      remove(batch);
      // Bölme sırasında sağlam çıkan grup: hatalı noktaya yaklaşırken grup yavaşça büyür.
      batchLimit.current = Math.min(MAX_BATCH, batchLimit.current * 2);
      addLog(
        'sent',
        batch.length === 1 ? 'Konum gönderildi' : `Biriken ${batch.length} konum toplu gönderildi`,
        requestId,
      );
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(String(err), 0, null, null);
      if (e.status === 429 || e.status === 503) {
        const wait = e.retryAfterSeconds ?? 5;
        retryAt.current = Date.now() + wait * 1000;
        addLog(
          'wait',
          `${e.status === 429 ? 'Gönderim sınırı aşıldı' : 'Sunucu yoğun'}, ${wait} sn sonra tekrar denenecek (${e.status})`,
          e.requestId,
        );
      } else if (e.status === 400 && batch.length > 1) {
        // Sunucu toplu isteği tek bir hatalı nokta yüzünden bütünüyle reddeder;
        // grubu ikiye bölüp tekrar dene, sağlam noktalar kaybolmasın.
        batchLimit.current = Math.ceil(batch.length / 2);
        addLog(
          'error',
          `Toplu gönderim reddedildi, ${batchLimit.current}'lik gruplarla denenecek: ${e.message} (400)`,
          e.requestId,
        );
      } else if (e.status === 400) {
        // Tek nokta: tekrar gönderilse de düzelmez; kuyruğu tıkamasın diye atılır.
        remove(batch);
        batchLimit.current = MAX_BATCH;
        addLog('error', `Sunucu konumu reddetti: ${e.message} (400)`, e.requestId);
      } else {
        retryAt.current = Date.now() + NETWORK_RETRY_MS;
        addLog(
          'wait',
          `${e.status ? `Sunucu hatası (${e.status})` : 'Sunucuya ulaşılamadı'}, 5 sn sonra tekrar denenecek`,
          e.requestId,
        );
      }
    } finally {
      inFlight.current = false;
      setPending(queue.current.length);
    }
  }, [online, addLog, remove]);

  useEffect(() => {
    if (online && queue.current.length > 0) {
      retryAt.current = 0;
      addLog('sent', `Bağlantı geldi, ${queue.current.length} konum gönderiliyor`);
    }
    const timer = setInterval(() => void flush(), 1000);
    void flush();
    return () => clearInterval(timer);
  }, [online, flush, addLog]);

  return { record, pending, log };
}
