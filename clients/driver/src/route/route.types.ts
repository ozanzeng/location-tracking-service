import type { LatLng } from '../geo/geo.types';
import type { Snap } from '../roads/roads.types';

/** Scooter'ı hareket ettirme biçimi. */
export const MoveMode = { DRAG: 'drag', ROUTE: 'route' } as const;

export type MoveMode = (typeof MoveMode)[keyof typeof MoveMode];

/** Hesaplanan rota: duraklar ve yol. */
export interface Route {
  /** Scooter'ın rota çizimine başlandığı andaki yol noktası. */
  start: Snap;
  stops: Snap[];
  /** start → stops[0] → stops[1] ... arasındaki yol parçaları. */
  legs: LatLng[][];
}

/** Uyarının türü. */
export const NoticeKind = { INFO: 'info', ERROR: 'error' } as const;

export type NoticeKind = (typeof NoticeKind)[keyof typeof NoticeKind];

/** Rota çizerken gösterilen uyarı. */
export interface RouteNotice {
  text: string;
  kind: NoticeKind;
}
