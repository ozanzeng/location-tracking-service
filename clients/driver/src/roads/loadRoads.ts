import { ROADS_URL } from '../config';
import { RoadNetwork, type CompactRoads } from './RoadNetwork';

let loading: Promise<RoadNetwork> | null = null;

/** Yol ağını bir kez yükler (~280 KB sıkıştırılmış). */
export function loadRoadNetwork(url = ROADS_URL): Promise<RoadNetwork> {
  loading ??= fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Yol haritası yüklenemedi (${res.status})`);
      return res.json() as Promise<CompactRoads>;
    })
    .then((data) => new RoadNetwork(data))
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}
