// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { Zone } from '../geo/zone';
import { RoadNetwork, type CompactRoads } from '../roads/RoadNetwork';
import { useRoutePlanner } from './useRoutePlanner';

// Dört tarafı yollu ~220 m'lik blok; üst kenarın ortasında küçük bir sürüş yasak bölge.
//   B ──[X]── C
//   │         │
//   A ─────── D
const deg = (lat: number, lng: number) => [Math.round((41 + lat) * 1e6), Math.round((29 + lng) * 1e6)];
const at = (lat: number, lng: number) => ({ lat: 41 + lat, lng: 29 + lng });
const network: CompactRoads = {
  nodes: [...deg(0, 0), ...deg(0.002, 0), ...deg(0.002, 0.002), ...deg(0, 0.002)],
  ways: [[0, 1, 2, 3, 0]],
};
const noRide: Zone = [
  [at(0.0017, 0.0008), at(0.0017, 0.0012), at(0.0023, 0.0012), at(0.0023, 0.0008), at(0.0017, 0.0008)],
];

function setup() {
  const roads = new RoadNetwork(network);
  const restrictions = roads.restrict([noRide]);
  const live = { current: at(0, 0.0005) }; // A-D kenarında
  const hook = renderHook(() => useRoutePlanner(roads, restrictions, live));
  const snap = (lat: number, lng: number) => roads.snap(at(lat, lng))!;
  return { ...hook, snap };
}

describe('useRoutePlanner', () => {
  test('duraklar eklenir, rota yolları takip eder', () => {
    const { result, snap } = setup();
    act(() => result.current.addStop(snap(0.001, 0))); // A-B kenarı
    act(() => result.current.addStop(snap(0.002, 0.0003))); // B-C kenarı, bölgenin batısı
    expect(result.current.stops).toHaveLength(2);
    expect(result.current.length).toBeGreaterThan(200);
    expect(result.current.notice).toBeNull();
  });

  test('sürüş yasak bölge içindeki durak bölgenin sınırına konur', () => {
    const { result, snap } = setup();
    act(() => result.current.addStop(snap(0.002, 0.001))); // bölgenin ortası
    expect(result.current.notice).toMatchObject({ kind: 'info' });
    const stop = result.current.stops[0];
    // Batı sınırı (lng 29.0008) ya da doğu sınırı (lng 29.0012); bölgenin içinde değil.
    expect([29.0008, 29.0012].some((lng) => Math.abs(stop.lng - lng) < 1e-7)).toBe(true);
  });

  test('ortadaki durak silinince rota kalan duraklarla yeniden kurulur', () => {
    const { result, snap } = setup();
    act(() => result.current.addStop(snap(0.001, 0)));
    act(() => result.current.addStop(snap(0.002, 0.0003)));
    act(() => result.current.addStop(snap(0.001, 0.002)));
    const withMiddle = result.current.length;
    act(() => result.current.removeStop(1));
    expect(result.current.stops).toHaveLength(2);
    expect(result.current.length).not.toBe(withMiddle);
  });

  test('son durak silinince rota temizlenir', () => {
    const { result, snap } = setup();
    act(() => result.current.addStop(snap(0.001, 0)));
    act(() => result.current.removeStop(0));
    expect(result.current.stops).toEqual([]);
    expect(result.current.path).toEqual([]);
  });
});
