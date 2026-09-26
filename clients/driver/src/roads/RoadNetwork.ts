import { distance, M_PER_DEG_LAT, metersBetween, mPerDegLng, pathLength, type LatLng } from '../geo/latlng';
import { pointInZone, type Zone } from '../geo/zone';
import { MinHeap } from './minHeap';

/**
 * Yol ağı: tıklanan/sürüklenen noktayı en yakın yola yapıştırır ve iki nokta arasında
 * yollar üzerinden en kısa rotayı bulur. Sürüş yasak bölgeler verilirse rota bu
 * bölgelere girmez; hedef bölgenin içindeyse rota bölgenin sınırında biter.
 * Veri scripts/fetch-roads.mjs ile OpenStreetMap'ten üretilir (public/roads-kadikoy.json).
 */

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

/** Izgara hücresi ~110 m; yakın yol ararken sadece çevredeki hücrelere bakılır. */
const CELL_DEG = 0.001;
/** Sınır noktalarının kendisi yolun "dışı" sayılsın diye kesişim karşılaştırmasında pay. */
const EPS = 1e-9;
/** Bölge içindeki hedefte: sınır noktası tıklanan yere uzaksa bu katsayıyla cezalandırılır. */
const ENTRY_DISTANCE_WEIGHT = 2;
const ENTRY_CANDIDATES = 6;

/** p→q parçasının r→s ile kesiştiği yer (p→q üzerinde 0..1) ya da null. */
function intersect(p: LatLng, q: LatLng, r: LatLng, s: LatLng): number | null {
  const d1x = q.lng - p.lng;
  const d1y = q.lat - p.lat;
  const d2x = s.lng - r.lng;
  const d2y = s.lat - r.lat;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-18) return null;
  const t = ((r.lng - p.lng) * d2y - (r.lat - p.lat) * d2x) / denom;
  const u = ((r.lng - p.lng) * d1y - (r.lat - p.lat) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

export class RoadNetwork {
  private readonly lat: Float64Array;
  private readonly lng: Float64Array;
  /** Komşuluk: düğüm → [komşu, uzunluk(m), parça, komşu, uzunluk, parça, ...] */
  private readonly adjacency: number[][];
  private readonly segments: Array<[number, number]> = [];
  private readonly grid = new Map<string, number[]>();

  constructor(data: CompactRoads) {
    const count = data.nodes.length / 2;
    this.lat = new Float64Array(count);
    this.lng = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      this.lat[i] = data.nodes[2 * i] / 1e6;
      this.lng[i] = data.nodes[2 * i + 1] / 1e6;
    }
    this.adjacency = Array.from({ length: count }, () => []);

    for (const way of data.ways) {
      for (let k = 1; k < way.length; k++) {
        const a = way[k - 1];
        const b = way[k];
        if (a === b) continue;
        // Scooter için tek yönlü kısıtlama uygulanmaz; yollar iki yönlü.
        const length = this.length(a, b);
        const segment = this.segments.push([a, b]) - 1;
        this.adjacency[a].push(b, length, segment);
        this.adjacency[b].push(a, length, segment);
        this.index(segment);
      }
    }
  }

  get nodeCount(): number {
    return this.lat.length;
  }

  private node(i: number): LatLng {
    return { lat: this.lat[i], lng: this.lng[i] };
  }

  private length(a: number, b: number): number {
    return metersBetween(this.lat[a], this.lng[a], this.lat[b], this.lng[b]);
  }

  private at(segment: number, t: number): LatLng {
    const [a, b] = this.segments[segment];
    return {
      lat: this.lat[a] + t * (this.lat[b] - this.lat[a]),
      lng: this.lng[a] + t * (this.lng[b] - this.lng[a]),
    };
  }

  /** Kutuyu kapsayan ızgara hücrelerindeki parçalar (tekrarsız). */
  private segmentsIn(minLat: number, minLng: number, maxLat: number, maxLng: number): Set<number> {
    const found = new Set<number>();
    for (let y = Math.floor(minLat / CELL_DEG); y <= Math.floor(maxLat / CELL_DEG); y++) {
      for (let x = Math.floor(minLng / CELL_DEG); x <= Math.floor(maxLng / CELL_DEG); x++) {
        for (const s of this.grid.get(`${y}:${x}`) ?? []) found.add(s);
      }
    }
    return found;
  }

  /** Parçayı kapsadığı tüm hücrelere ekler. */
  private index(segment: number): void {
    const [a, b] = this.segments[segment];
    const minLat = Math.floor(Math.min(this.lat[a], this.lat[b]) / CELL_DEG);
    const maxLat = Math.floor(Math.max(this.lat[a], this.lat[b]) / CELL_DEG);
    const minLng = Math.floor(Math.min(this.lng[a], this.lng[b]) / CELL_DEG);
    const maxLng = Math.floor(Math.max(this.lng[a], this.lng[b]) / CELL_DEG);
    for (let y = minLat; y <= maxLat; y++) {
      for (let x = minLng; x <= maxLng; x++) {
        const key = `${y}:${x}`;
        const cell = this.grid.get(key);
        if (cell) cell.push(segment);
        else this.grid.set(key, [segment]);
      }
    }
  }

  /** Noktaya en yakın yol noktası; maxMeters içinde yol yoksa null (arsa, deniz vb.). */
  snap(p: LatLng, maxMeters = 60): Snap | null {
    const kx = mPerDegLng(p.lat);
    const pad = maxMeters / Math.min(kx, M_PER_DEG_LAT);
    let best: Snap | null = null;

    for (const s of this.segmentsIn(p.lat - pad, p.lng - pad, p.lat + pad, p.lng + pad)) {
      const [a, b] = this.segments[s];
      // Noktaya göre metre cinsinden düzlem koordinatları
      const ax = (this.lng[a] - p.lng) * kx;
      const ay = (this.lat[a] - p.lat) * M_PER_DEG_LAT;
      const bx = (this.lng[b] - p.lng) * kx;
      const by = (this.lat[b] - p.lat) * M_PER_DEG_LAT;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d <= maxMeters && (!best || d < best.distance)) {
        best = { point: this.at(s, t), segment: s, a, b, t, distance: d };
      }
    }
    return best;
  }

  /**
   * Yasak bölgelere göre kısıtları bir kez hesaplar: içerideki düğümler, sınırı kesen
   * parçalar ve yolun bölgeye girdiği sınır noktaları.
   */
  restrict(zones: Zone[]): Restrictions {
    const blockedNode = new Uint8Array(this.nodeCount);
    const cuts = new Map<number, number[]>();
    const cutZone = new Map<number, number[]>();
    const entries = new Map<number, Snap[]>();

    zones.forEach((zone, z) => {
      const outer = zone[0];
      const minLat = Math.min(...outer.map((p) => p.lat));
      const maxLat = Math.max(...outer.map((p) => p.lat));
      const minLng = Math.min(...outer.map((p) => p.lng));
      const maxLng = Math.max(...outer.map((p) => p.lng));
      const nearby = this.segmentsIn(minLat, minLng, maxLat, maxLng);

      for (const s of nearby) {
        const [a, b] = this.segments[s];
        for (const n of [a, b]) {
          if (!blockedNode[n] && pointInZone(this.node(n), zone)) blockedNode[n] = 1;
        }
        for (const ring of zone) {
          for (let i = 1; i < ring.length; i++) {
            const t = intersect(this.node(a), this.node(b), ring[i - 1], ring[i]);
            if (t === null) continue;
            (cuts.get(s) ?? cuts.set(s, []).get(s)!).push(t);
            (cutZone.get(s) ?? cutZone.set(s, []).get(s)!).push(z);
          }
        }
      }
    });

    for (const [s, ts] of cuts) {
      const zonesOf = cutZone.get(s)!;
      const order = ts.map((_, i) => i).sort((i, j) => ts[i] - ts[j]);
      const sorted = order.map((i) => ts[i]);
      cuts.set(s, sorted);
      const [a, b] = this.segments[s];
      // Parçanın serbest ucundan bakınca ilk sınır noktası, bölgeye giriş noktasıdır.
      const add = (t: number, zone: number) => {
        const list = entries.get(zone) ?? entries.set(zone, []).get(zone)!;
        list.push({ point: this.at(s, t), segment: s, a, b, t, distance: 0 });
      };
      if (!blockedNode[a]) add(sorted[0], zonesOf[order[0]]);
      if (!blockedNode[b]) add(sorted.at(-1)!, zonesOf[order.at(-1)!]);
    }

    return { zones, blockedNode, cuts, entries };
  }

  /** Noktanın içinde olduğu yasak bölge (indeksi) ya da -1. */
  zoneAt(p: LatLng, r: Restrictions): number {
    return r.zones.findIndex((zone) => pointInZone(p, zone));
  }

  /** Parçanın t1..t2 arası yasak bölge sınırını kesmiyor mu (uçlar hariç)? */
  private clear(segment: number, t1: number, t2: number, r?: Restrictions): boolean {
    if (!r) return true;
    const lo = Math.min(t1, t2) + EPS;
    const hi = Math.max(t1, t2) - EPS;
    return !(r.cuts.get(segment) ?? []).some((t) => t > lo && t < hi);
  }

  private open(node: number, r?: Restrictions): boolean {
    return !r || !r.blockedNode[node];
  }

  /**
   * İki yol noktası arasındaki en kısa rota (A*). Başlangıç ve bitiş, parçaların
   * ortasındaki sanal düğümlerdir; rota tam tıklanan yerden başlar ve orada biter.
   * Kısıtlar verilirse yasak bölgelere giren parçalar kullanılmaz. Rota yoksa null.
   */
  route(from: Snap, to: Snap, r?: Restrictions): LatLng[] | null {
    const n = this.nodeCount;
    const START = n;
    const END = n + 1;
    const fromLen = this.length(from.a, from.b);
    const toLen = this.length(to.a, to.b);

    const g = new Float64Array(n + 2).fill(Infinity);
    const prev = new Int32Array(n + 2).fill(-1);
    const done = new Uint8Array(n + 2);
    const heap = new MinHeap();
    const h = (i: number) => (i === END ? 0 : metersBetween(this.lat[i], this.lng[i], to.point.lat, to.point.lng));

    const relax = (via: number, node: number, cost: number) => {
      if (cost < g[node]) {
        g[node] = cost;
        prev[node] = via;
        heap.push(cost + h(node), node);
      }
    };

    g[START] = 0;
    // Aynı parça üzerindeki iki nokta: doğrudan git.
    if (from.segment === to.segment && this.clear(from.segment, from.t, to.t, r)) {
      relax(START, END, Math.abs(from.t - to.t) * fromLen);
    }
    if (this.open(from.a, r) && this.clear(from.segment, 0, from.t, r)) {
      relax(START, from.a, from.t * fromLen);
    }
    if (this.open(from.b, r) && this.clear(from.segment, from.t, 1, r)) {
      relax(START, from.b, (1 - from.t) * fromLen);
    }

    while (heap.size > 0) {
      const u = heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      if (u === END) break;
      if (u === to.a && this.clear(to.segment, 0, to.t, r)) relax(u, END, g[u] + to.t * toLen);
      if (u === to.b && this.clear(to.segment, to.t, 1, r)) relax(u, END, g[u] + (1 - to.t) * toLen);
      if (u >= n) continue;
      const edges = this.adjacency[u];
      for (let k = 0; k < edges.length; k += 3) {
        const v = edges[k];
        if (!this.open(v, r) || !this.clear(edges[k + 2], 0, 1, r)) continue;
        relax(u, v, g[u] + edges[k + 1]);
      }
    }

    if (!done[END]) return null;
    const path: LatLng[] = [to.point];
    for (let i = prev[END]; i !== START && i !== -1; i = prev[i]) {
      path.push(this.node(i));
    }
    path.push(from.point);
    return path.reverse();
  }

  /**
   * Hedef bir yasak bölgenin içindeyse: bölgenin sınırına kadar giden rota. Yolun
   * bölgeye girdiği noktalardan, hem yakın hem de tıklanan yere yakın olanı seçilir.
   */
  routeToZoneEdge(from: Snap, target: LatLng, zone: number, r: Restrictions): { path: LatLng[]; entry: Snap } | null {
    const candidates = (r.entries.get(zone) ?? [])
      .toSorted((x, y) => distance(x.point, target) - distance(y.point, target))
      .slice(0, ENTRY_CANDIDATES);
    let best: { path: LatLng[]; entry: Snap; score: number } | null = null;
    for (const entry of candidates) {
      const path = this.route(from, entry, r);
      if (!path) continue;
      const score = pathLength(path) + ENTRY_DISTANCE_WEIGHT * distance(entry.point, target);
      if (!best || score < best.score) best = { path, entry, score };
    }
    return best ? { path: best.path, entry: best.entry } : null;
  }
}
