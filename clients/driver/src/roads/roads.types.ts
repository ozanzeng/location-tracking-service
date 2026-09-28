import type { LatLng, Zone } from '../geo/geo.types';

/** Yol üzerindeki bir nokta: a→b parçasının t oranındaki yeri. */
export interface Snap {
  point: LatLng;
  segment: number;
  a: number;
  b: number;
  t: number;
  /** Tıklanan noktanın yola uzaklığı (m). */
  distance: number;
}

export interface CompactRoads {
  nodes: number[];
  ways: number[][];
}

/** restrict() çıktısı: yasak bölgelere göre kapalı yollar ve bölge giriş noktaları. */
export interface Restrictions {
  zones: Zone[];
  /** Bölgelerden birinin içindeki düğümler. */
  blockedNode: Uint8Array;
  /** Parça → bölge sınırını kestiği yerler (t, 0..1, sıralı). */
  cuts: Map<number, number[]>;
  /** Bölge → yolun bölgeye girdiği sınır noktaları. */
  entries: Map<number, Snap[]>;
}
