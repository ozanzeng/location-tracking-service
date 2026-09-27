import { useCallback, useMemo, useState, type RefObject } from 'react';
import { START_SNAP_METERS } from '../config';
import { pathLength, type LatLng } from '../geo/latlng';
import type { Restrictions, RoadNetwork, Snap } from '../roads/RoadNetwork';

interface Route {
  /** Scooter'ın rota çizimine başlandığı andaki yol noktası. */
  start: Snap;
  stops: Snap[];
  /** start → stops[0] → stops[1] ... arasındaki yol parçaları. */
  legs: LatLng[][];
}

export const NoticeKind = { INFO: 'info', ERROR: 'error' } as const;
export type NoticeKind = (typeof NoticeKind)[keyof typeof NoticeKind];

export interface RouteNotice {
  text: string;
  kind: NoticeKind;
}

/**
 * Rota planlama: duraklar yollara yapışır, aralarındaki rota yol ağı üzerinden hesaplanır
 * ve sürüş yasak bölgelere girmez. Hedef yasak bölgenin içindeyse durak sınıra konur.
 */
export function useRoutePlanner(roads: RoadNetwork | null, restrictions: Restrictions | null, live: RefObject<LatLng>) {
  const [route, setRoute] = useState<Route | null>(null);
  const [hoveredStop, setHoveredStop] = useState<number | null>(null);
  const [notice, setNotice] = useState<RouteNotice | null>(null);

  const clear = useCallback(() => {
    setRoute(null);
    setHoveredStop(null);
    setNotice(null);
  }, []);

  /** Yeni durağı, son durağın (ya da scooter'ın) konumundan yollar üzerinden bağlar. */
  const addStop = (stop: Snap) => {
    if (!roads || !restrictions) return;
    const start = route?.start ?? roads.snap(live.current, START_SNAP_METERS);
    const from = route?.stops.at(-1) ?? start;
    if (!start || !from) return;

    const zone = roads.zoneAt(stop.point, restrictions);
    let leg: { path: LatLng[]; entry: Snap } | null;
    if (zone >= 0) {
      leg = roads.routeToZoneEdge(from, stop.point, zone, restrictions);
    } else {
      const path = roads.route(from, stop, restrictions);
      leg = path ? { path, entry: stop } : null;
    }
    if (!leg) {
      setNotice({
        text: 'Bu noktaya sürüş yasak bölgelere girmeden ulaşılamıyor; başka bir yol seçin.',
        kind: NoticeKind.ERROR,
      });
      return;
    }
    setNotice(
      zone >= 0
        ? { text: 'Sürüş yasak bölgeye girilemez; durak bölgenin sınırına kondu.', kind: NoticeKind.INFO }
        : null,
    );
    setRoute({
      start,
      stops: [...(route?.stops ?? []), leg.entry],
      legs: [...(route?.legs ?? []), leg.path],
    });
  };

  /** Durağı siler; kalan duraklar yeniden yollar üzerinden bağlanır. */
  const removeStop = (index: number) => {
    if (!roads || !route) return;
    const stops = route.stops.filter((_, i) => i !== index);
    if (stops.length === 0) {
      clear();
      return;
    }
    const legs: LatLng[][] = [];
    let from = route.start;
    for (const stop of stops) {
      const leg = roads.route(from, stop, restrictions ?? undefined);
      if (!leg) {
        setNotice({ text: 'Durak silinince rota kurulamıyor; önce başka bir durağı silin.', kind: NoticeKind.ERROR });
        return;
      }
      legs.push(leg);
      from = stop;
    }
    setNotice(null);
    setRoute({ start: route.start, stops, legs });
  };

  const stops = useMemo(() => route?.stops.map((s) => s.point) ?? [], [route]);
  // Parçaları birleştir; her parçanın ilk noktası bir öncekinin son noktasıdır.
  const path = useMemo(() => route?.legs.flatMap((leg, i) => (i === 0 ? leg : leg.slice(1))) ?? [], [route]);
  const length = useMemo(() => pathLength(path), [path]);

  return { stops, path, length, notice, hoveredStop, setHoveredStop, addStop, removeStop, clear };
}
