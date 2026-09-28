import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@shared/api/client';
import type { LocationPoint } from '@shared/api/types';
import {
  DEVICE_LOG_SIZE,
  NETWORK_RETRY_MS,
  OUTBOX_MAX_BATCH as MAX_BATCH,
  OUTBOX_MAX_QUEUE as MAX_QUEUE,
} from '../config';

/** Cihaz günlüğü satırının türü (CSS'te device-log__item--<tür>). */
export const LogKind = { SENT: 'sent', QUEUED: 'queued', WAIT: 'wait', ERROR: 'error' } as const;
export type LogKind = (typeof LogKind)[keyof typeof LogKind];

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
   * bölme sırasında sağlam çıkan grup sonrakini ikiye katlar.
   */
  const batchLimit = useRef(MAX_BATCH);
  /**
   * Hatalı nokta atıldıktan sonra sıradaki tek nokta denenir. O da reddedilirse bölme
   * yapılmadan atılır; ardışık hatalı noktalar (ör. cihaz saati ileride) nokta başına tek
   * istek harcar. Sağlamsa grup hemen tam boyuta döner.
   */
  const probing = useRef(false);
  const nextLogId = useRef(0);
  const [pending, setPending] = useState(0);
  const [log, setLog] = useState<DeviceLogEntry[]>([]);

  const addLog = useCallback((kind: LogKind, text: string, requestId?: string | null) => {
    const entry = { id: nextLogId.current++, at: new Date(), kind, text, requestId };
    setLog((list) => [entry, ...list].slice(0, DEVICE_LOG_SIZE));
  }, []);

  /** Kaydedilen konum saniyelik zamanlayıcıyı beklemeden gönderilsin diye flush'a erişim. */
  const flushNow = useRef<() => void>(() => {});

  /** Bağlantı durumu ref'ten okunur: `record` kimliği değişmesin, ölçüm düzeni bozulmasın. */
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const record = useCallback(
    (point: LocationPoint) => {
      queue.current.push(point);
      if (queue.current.length > MAX_QUEUE) queue.current.splice(0, queue.current.length - MAX_QUEUE);
      setPending(queue.current.length);
      if (!onlineRef.current)
        addLog(LogKind.QUEUED, `Çevrimdışı: konum sıraya alındı (${queue.current.length} bekliyor)`);
      flushNow.current();
    },
    [addLog],
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
      batchLimit.current = probing.current ? MAX_BATCH : Math.min(MAX_BATCH, batchLimit.current * 2);
      probing.current = false;
      addLog(
        LogKind.SENT,
        batch.length === 1 ? 'Konum gönderildi' : `Biriken ${batch.length} konum toplu gönderildi`,
        requestId,
      );
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(String(err), 0, null, null);
      if (e.status === 429 || e.status === 503) {
        const wait = e.retryAfterSeconds ?? 5;
        retryAt.current = Date.now() + wait * 1000;
        addLog(
          LogKind.WAIT,
          `${e.status === 429 ? 'Gönderim sınırı aşıldı' : 'Sunucu yoğun'}, ${wait} sn sonra tekrar denenecek (${e.status})`,
          e.requestId,
        );
      } else if (e.status === 400 && batch.length > 1) {
        // Sunucu toplu isteği tek bir hatalı nokta yüzünden bütünüyle reddeder;
        // grubu ikiye bölüp tekrar dene, sağlam noktalar kaybolmasın.
        batchLimit.current = Math.ceil(batch.length / 2);
        addLog(
          LogKind.ERROR,
          `Toplu gönderim reddedildi, ${batchLimit.current}'lik gruplarla denenecek: ${e.message} (400)`,
          e.requestId,
        );
      } else if (e.status === 400) {
        // Tek nokta: tekrar gönderilse de düzelmez; kuyruğu tıkamasın diye atılır.
        remove(batch);
        batchLimit.current = 1;
        probing.current = true;
        addLog(LogKind.ERROR, `Sunucu konumu reddetti: ${e.message} (400)`, e.requestId);
      } else if (e.status === 401 || e.status === 403) {
        // Anahtar sorunu: tekrar göndermek düzeltmez ama ayar düzelince gidebilsin diye noktalar tutulur.
        // Yerel geliştirmede en sık sebep, sürücü anahtarının API'de tanımlı olmaması.
        retryAt.current = Date.now() + NETWORK_RETRY_MS;
        addLog(
          LogKind.ERROR,
          e.status === 401
            ? 'Sunucu sürücü anahtarını tanımadı (401). Yerel geliştirmede api/.env içinde INGEST_API_KEYS=dev-driver-key olmalı'
            : 'Sürücü anahtarının bu işlem için yetkisi yok (403)',
          e.requestId,
        );
      } else {
        retryAt.current = Date.now() + NETWORK_RETRY_MS;
        addLog(
          LogKind.WAIT,
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
    flushNow.current = () => void flush();
  }, [flush]);

  useEffect(() => {
    if (online && queue.current.length > 0) {
      retryAt.current = 0;
      addLog(LogKind.SENT, `Bağlantı geldi, ${queue.current.length} konum gönderiliyor`);
    }
    const timer = setInterval(() => void flush(), 1000);
    void flush();
    return () => clearInterval(timer);
  }, [online, flush, addLog]);

  return { record, pending, log };
}
