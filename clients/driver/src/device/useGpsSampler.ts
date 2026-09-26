import { useEffect, type RefObject } from 'react';
import type { LocationPoint } from '@shared/api/types';
import { GPS_INTERVAL_MS } from '../config';
import type { LatLng } from '../geo/latlng';

/** Sürüş boyunca 5 saniyede bir o anki konumu ölçer ve gönderim kuyruğuna koyar. */
export function useGpsSampler(
  active: boolean,
  scooterId: string,
  live: RefObject<LatLng>,
  record: (point: LocationPoint) => void,
) {
  useEffect(() => {
    if (!active) return;
    const sample = () => record({ userId: scooterId, ...live.current, timestamp: new Date().toISOString() });
    sample();
    const timer = setInterval(sample, GPS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, scooterId, live, record]);
}
