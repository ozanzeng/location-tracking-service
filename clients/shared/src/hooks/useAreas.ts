import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Area } from '../api/types';
import { SocketEvent } from '../realtime/events';
import { getSocket } from '../realtime/socket';

/** Son başlatılan istek (süren ya da bitmiş); ekranlar arası geçişte tekrar istek atılmaz. */
let cache: Promise<Area[]> | null = null;
let inFlight: Promise<Area[]> | null = null;
/** Son başarılı sonuç: duyurulan alan zaten listedeyse yeni istek gerekmez. */
let latest: Area[] | null = null;
/**
 * Süren istek bitince yapılacak kontrol. O istek, beklenen alan kaydedilmeden önce başlamış
 * olabilir: bitince beklenen alanların hepsi sonuçta yoksa bir kez daha istenir. Bu arada
 * gelen bütün yenilemeler aynı kontrolü (ve en fazla bir ek isteği) paylaşır.
 */
let pending: { expected: Set<string>; unknown: boolean; result: Promise<Area[]> } | null = null;

const includesAll = (list: Area[], ids: Iterable<string>) => [...ids].every((id) => list.some((a) => a.id === id));

function start(): Promise<Area[]> {
  const request = api.areas();
  cache = inFlight = request;
  request.then(
    (list) => {
      if (cache === request) latest = list;
    },
    () => undefined,
  );
  const done = () => {
    if (inFlight === request) inFlight = null;
  };
  request.then(done, done);
  return request;
}

/**
 * Yeniden çeker. `expectedId`: listede olması beklenen alan (kaydedilen ya da duyurulan).
 * Kimliksiz yenileme her zaman sunucuya gider.
 */
function refresh(expectedId?: string): Promise<Area[]> {
  const running = inFlight;
  if (!running) {
    if (expectedId !== undefined && latest && includesAll(latest, [expectedId])) return Promise.resolve(latest);
    return start();
  }
  if (!pending) {
    const check = { expected: new Set<string>(), unknown: false, result: running };
    check.result = running
      .then(
        (list): Area[] | null => list,
        () => null,
      )
      .then((list) => {
        pending = null;
        return list && !check.unknown && includesAll(list, check.expected) ? list : start();
      });
    pending = check;
  }
  if (expectedId === undefined) pending.unknown = true;
  else pending.expected.add(expectedId);
  return pending.result;
}

/**
 * Alanları bir kez çeker; ekranlar arası geçişte tekrar istek atmaz. Başka bir istemci
 * (operasyon) yeni alan oluşturduğunda sunucunun duyurusuyla kendiliğinden yenilenir.
 */
export function useAreas() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((request: Promise<Area[]>) => {
    request.then(
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
    apply(cache ?? start());
    const socket = getSocket();
    const onChanged = (message?: { created?: { id?: string } }) => apply(refresh(message?.created?.id));
    socket.on(SocketEvent.AREAS_CHANGED, onChanged);
    return () => {
      socket.off(SocketEvent.AREAS_CHANGED, onChanged);
    };
  }, [apply]);

  /** Kaydedilen alanın kimliği verilirse, liste onu zaten içeriyorsa tekrar istenmez. */
  const reload = useCallback((expectedId?: string) => apply(refresh(expectedId)), [apply]);

  return { areas, error, reload };
}
