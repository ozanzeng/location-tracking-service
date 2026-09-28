import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'vitest';
import { pathLength } from '../geo/latlng';
import { distanceToZone, pointInZone } from '../geo/zone';
import { RoadNetwork } from './RoadNetwork';
import type { LatLng, Zone } from '../geo/geo.types';
import type { CompactRoads } from './roads.types';

// Yaklaşık 220 m'lik kare blok; A-B-C-D yolları var, D-A yolu yok (bloğun bir yanı açık).
//   B ───── C
//   │       │
//   A       D
const deg = (lat: number, lng: number) => [Math.round((41 + lat) * 1e6), Math.round((29 + lng) * 1e6)];
const A = deg(0, 0),
  B = deg(0.002, 0),
  C = deg(0.002, 0.002),
  D = deg(0, 0.002);
const E = deg(0.01, 0.01),
  F = deg(0.0105, 0.01); // bağlantısız ayrı bir yol
const block: CompactRoads = {
  nodes: [...A, ...B, ...C, ...D, ...E, ...F],
  ways: [
    [0, 1, 2, 3],
    [4, 5],
  ],
};
const at = (lat: number, lng: number): LatLng => ({ lat: 41 + lat, lng: 29 + lng });

describe('RoadNetwork.snap', () => {
  const roads = new RoadNetwork(block);

  test('yol kenarındaki noktayı yolun üzerine taşır', () => {
    const snap = roads.snap(at(0.001, 0.0002)); // A-B yolunun ~17 m doğusu
    assert.ok(snap);
    assert.ok(Math.abs(snap.point.lng - 29) < 1e-9, 'A-B yolu üzerinde olmalı');
    assert.ok(Math.abs(snap.point.lat - 41.001) < 1e-9);
    assert.ok(snap.distance > 15 && snap.distance < 20);
  });

  test('yakında yol yoksa (arsa ortası) null döner', () => {
    assert.equal(roads.snap(at(0.0005, 0.001)), null); // bloğun içi, yollara >55 m
  });

  test('arama yarıçapı büyütülünce en yakın yolu bulur', () => {
    const snap = roads.snap(at(0.0005, 0.001), 200);
    assert.ok(snap);
    assert.ok(snap.distance < 100);
  });
});

describe('RoadNetwork.route', () => {
  const roads = new RoadNetwork(block);

  test('bloğun içinden değil, yollar üzerinden dolaşır', () => {
    const from = roads.snap(at(0.0002, 0))!; // A yakını, A-B üzerinde
    const to = roads.snap(at(0.0002, 0.002))!; // D yakını, C-D üzerinde
    const path = roads.route(from, to)!;
    assert.ok(path);
    const visits = (p: number[]) =>
      path.some((q) => Math.abs(q.lat - p[0] / 1e6) < 1e-9 && Math.abs(q.lng - p[1] / 1e6) < 1e-9);
    assert.ok(visits(B) && visits(C), 'rota B ve C köşelerinden geçmeli');
    assert.deepEqual(path[0], from.point);
    assert.deepEqual(path.at(-1), to.point);
  });

  test('aynı yol parçası üzerindeki iki nokta arasında doğrudan gider', () => {
    const from = roads.snap(at(0.0005, 0))!;
    const to = roads.snap(at(0.0015, 0))!;
    assert.deepEqual(roads.route(from, to), [from.point, to.point]);
  });

  test('bağlantısı olmayan yola rota bulunamaz', () => {
    const from = roads.snap(at(0.0005, 0))!;
    const to = roads.snap(at(0.0102, 0.01))!;
    assert.equal(roads.route(from, to), null);
  });
});

describe('Sürüş yasak bölgeler', () => {
  // Dört tarafı yollu blok; B-C yolunun ortasında küçük bir yasak bölge.
  //   B ──[X]── C
  //   │         │
  //   A ─────── D
  const square: CompactRoads = { nodes: [...A, ...B, ...C, ...D], ways: [[0, 1, 2, 3, 0]] };
  const roads = new RoadNetwork(square);
  const zone: Zone = [
    [at(0.0017, 0.0008), at(0.0017, 0.0012), at(0.0023, 0.0012), at(0.0023, 0.0008), at(0.0017, 0.0008)],
  ];
  const r = roads.restrict([zone]);
  const entersZone = (path: LatLng[]) => {
    // Rotanın parçalarını sık örnekleyerek bölgeye girip girmediğine bak.
    for (let i = 1; i < path.length; i++) {
      for (let k = 1; k < 20; k++) {
        const t = k / 20;
        const p = {
          lat: path[i - 1].lat + t * (path[i].lat - path[i - 1].lat),
          lng: path[i - 1].lng + t * (path[i].lng - path[i - 1].lng),
        };
        if (pointInZone(p, zone)) return true;
      }
    }
    return false;
  };

  test('yasak bölgeden geçen kısa yol yerine etrafından dolaşır', () => {
    const from = roads.snap(at(0.002, 0.0003))!; // B-C üzerinde, bölgenin batısı
    const to = roads.snap(at(0.002, 0.0017))!; // B-C üzerinde, bölgenin doğusu
    const direct = roads.route(from, to)!;
    const detour = roads.route(from, to, r)!;
    assert.ok(detour, 'dolaşan rota bulunmalı');
    assert.ok(entersZone(direct), 'kısıtsız rota bölgeden geçer');
    assert.ok(!entersZone(detour), 'kısıtlı rota bölgeye girmemeli');
    assert.ok(pathLength(detour) > pathLength(direct) * 3);
  });

  test('hedef bölgenin içindeyse rota sınırda biter', () => {
    const from = roads.snap(at(0.002, 0.0003))!;
    const target = at(0.002, 0.001); // bölgenin ortası
    assert.equal(roads.zoneAt(target, r), 0);
    const path = roads.routeToZoneEdge(from, target, 0, r)!.path;
    assert.ok(path);
    const end = path.at(-1)!;
    assert.ok(!entersZone(path));
    // Bölgenin batı sınırında (lng = 29.0008) bitmeli.
    assert.ok(Math.abs(end.lng - 29.0008) < 1e-7, `bitiş ${end.lng}`);
    assert.ok(Math.abs(end.lat - 41.002) < 1e-7);
  });

  test('distanceToZone: içerideyse 0, dışarıdaysa en yakın kenara uzaklık', () => {
    assert.equal(distanceToZone(at(0.002, 0.001), zone), 0);
    // Bölgenin güney kenarı lat 0.0017; 0.0010'daki nokta ~77 m güneyde.
    const d = distanceToZone(at(0.001, 0.001), zone);
    assert.ok(Math.abs(d - 0.0007 * 110_540) < 1, `${d} m`);
  });

  test('bölgenin dışındaki nokta için zoneAt -1', () => {
    assert.equal(roads.zoneAt(at(0.001, 0.001), r), -1);
  });
});

describe('Kadıköy yol verisi', () => {
  const data = JSON.parse(readFileSync(new URL('../../public/roads-kadikoy.json', import.meta.url), 'utf8'));
  const roads = new RoadNetwork(data);

  test('başlangıç noktası ve Moda sahili yol ağına bağlı', () => {
    const start = roads.snap({ lat: 40.9878, lng: 29.0292 });
    const moda = roads.snap({ lat: 40.9812, lng: 29.0262 });
    assert.ok(start && moda);
    const path = roads.route(start, moda);
    assert.ok(path, 'rota bulunmalı');
    let length = 0;
    for (let i = 1; i < path.length; i++) {
      const dy = (path[i].lat - path[i - 1].lat) * 110_540;
      const dx = (path[i].lng - path[i - 1].lng) * 111_320 * Math.cos((path[i].lat * Math.PI) / 180);
      length += Math.hypot(dx, dy);
    }
    // Kuş uçuşu ~780 m; yol üzerinden daha uzun ama makul.
    assert.ok(length > 780 && length < 2000, `rota uzunluğu ${Math.round(length)} m`);
  });

  test('Moda Sahil Parkı (sürüş yasak) içine rota sınırda biter ve parka girmez', () => {
    // Seed'deki Moda Sahil Parkı poligonu
    const park: Zone = [
      [
        { lat: 40.9828, lng: 29.0218 },
        { lat: 40.9842, lng: 29.0262 },
        { lat: 40.9808, lng: 29.0302 },
        { lat: 40.9785, lng: 29.0275 },
        { lat: 40.9798, lng: 29.0232 },
        { lat: 40.9828, lng: 29.0218 },
      ],
    ];
    const r = roads.restrict([park]);
    const start = roads.snap({ lat: 40.9878, lng: 29.0292 })!;
    const target = { lat: 40.9812, lng: 29.0262 };
    assert.equal(roads.zoneAt(target, r), 0);
    const path = roads.routeToZoneEdge(start, target, 0, r)?.path;
    assert.ok(path, 'sınıra giden rota bulunmalı');
    assert.ok(
      path.every((p) => !pointInZone(p, park)),
      'rota noktaları parkın içinde olmamalı',
    );
    const end = path.at(-1)!;
    const toBoundary = Math.min(
      ...park[0].slice(1).map((b, i) => {
        const a = park[0][i];
        const t = Math.max(
          0,
          Math.min(
            1,
            ((end.lat - a.lat) * (b.lat - a.lat) + (end.lng - a.lng) * (b.lng - a.lng)) /
              ((b.lat - a.lat) ** 2 + (b.lng - a.lng) ** 2),
          ),
        );
        return Math.hypot(
          (a.lat + t * (b.lat - a.lat) - end.lat) * 110_540,
          (a.lng + t * (b.lng - a.lng) - end.lng) * 84_000,
        );
      }),
    );
    assert.ok(toBoundary < 0.5, `bitiş noktası sınıra ${toBoundary.toFixed(2)} m uzakta`);
  });

  test('deniz üzerindeki nokta yola yapışmaz', () => {
    assert.equal(roads.snap({ lat: 40.975, lng: 29.012 }), null);
  });
});
