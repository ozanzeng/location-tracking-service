import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { Area, LocationPoint } from '@shared/api/types';
import { GPS_INTERVAL_MS, MIN_SAMPLE_GAP_MS } from '../config';
import type { LatLng } from '../geo/latlng';
import { areaToZone, pointInZone } from '../geo/zone';

/** Noktayı içeren alanların kimlikleri; sınır geçişini fark etmek için karşılaştırılır. */
const zonesKey = (p: LatLng, zones: Array<{ id: string; zone: ReturnType<typeof areaToZone> }>) =>
  zones
    .filter((z) => pointInZone(p, z.zone))
    .map((z) => z.id)
    .join(',');

/**
 * Sürüş boyunca 5 saniyede bir o anki konumu ölçer ve gönderim kuyruğuna koyar.
 * Scooter bir alana girer ya da çıkarsa 5 saniyeyi beklemeden hemen ölçer (telefonlardaki
 * geofence tetikli konum güncellemesi gibi); bölge bildirimi saniyeler sonra değil, hemen gelir.
 * Giriş kaydını yine sunucu belirler, burası sadece konumu erken gönderir. Sınırda gidip gelen
 * scooter rate limit'e takılmasın diye iki ölçüm arasında en az MIN_SAMPLE_GAP_MS olur.
 */
export function useGpsSampler(
  active: boolean,
  scooterId: string,
  live: RefObject<LatLng>,
  position: LatLng,
  areas: Area[],
  record: (point: LocationPoint) => void,
) {
  const zones = useMemo(() => areas.map((area) => ({ id: area.id, zone: areaToZone(area) })), [areas]);
  /** Sürüş sürerken: hemen ölç ve 5 saniyelik sayacı baştan başlat. */
  const sampleNow = useRef<(() => void) | null>(null);
  /** Alan listesinin kimliği: aynı alanlar yeni bir dizide gelirse değişmiş sayılmasın. */
  const areasKey = areas.map((area) => area.id).join(',');
  const lastBoundary = useRef<{ areasKey: string; key: string } | null>(null);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let delayed: ReturnType<typeof setTimeout> | undefined;
    let lastAt = 0;
    const sample = () => {
      lastAt = Date.now();
      record({ userId: scooterId, ...live.current, timestamp: new Date().toISOString() });
    };
    const restart = () => {
      clearTimeout(delayed);
      const wait = lastAt + MIN_SAMPLE_GAP_MS - Date.now();
      if (wait > 0) {
        delayed = setTimeout(restart, wait);
        return;
      }
      clearInterval(timer);
      sample();
      timer = setInterval(sample, GPS_INTERVAL_MS);
    };
    sampleNow.current = restart;
    restart();
    return () => {
      clearInterval(timer);
      clearTimeout(delayed);
      sampleNow.current = null;
    };
  }, [active, scooterId, live, record]);

  useEffect(() => {
    const key = zonesKey(position, zones);
    const previous = lastBoundary.current;
    lastBoundary.current = { areasKey, key };
    // Alan listesi değiştiyse (yeni alan) karşılaştırma anlamsız: scooter yer değiştirmedi.
    if (previous && previous.areasKey === areasKey && previous.key !== key) sampleNow.current?.();
  }, [position, zones, areasKey]);
}
