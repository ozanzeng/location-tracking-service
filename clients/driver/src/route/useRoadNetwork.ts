import { useEffect, useMemo, useState } from 'react';
import type { Area } from '@shared/api/types';
import { zonesOfType } from '../geo/zone';
import { loadRoadNetwork } from '../roads/loadRoads';
import type { RoadNetwork } from '../roads/RoadNetwork';

/**
 * Yol ağını yükler ve sürüş yasak bölgelere göre kısıtları hesaplar. Operasyon yeni bir
 * yasak bölge çizerse `areas` değişir ve kısıtlar yeniden hesaplanır.
 */
export function useRoadNetwork(areas: Area[]) {
  const [roads, setRoads] = useState<RoadNetwork | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadRoadNetwork().then(
      (network) => active && setRoads(network),
      (err: Error) => active && setError(err.message),
    );
    return () => {
      active = false;
    };
  }, []);

  const noRideZones = useMemo(() => zonesOfType(areas, 'NO_RIDE'), [areas]);
  const restrictions = useMemo(() => (roads ? roads.restrict(noRideZones) : null), [roads, noRideZones]);

  return { roads, restrictions, error };
}
