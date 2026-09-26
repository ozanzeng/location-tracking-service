import { describe, expect, test } from 'vitest';
import type { Area } from '@shared/api/types';
import { areaToZone, distanceToZone, pointInZone, zonesOfType, type Zone } from './zone';

// 0..1 kare, ortasında 0.4..0.6 delik
const ring = (a: number, b: number) => [
  { lat: a, lng: a },
  { lat: a, lng: b },
  { lat: b, lng: b },
  { lat: b, lng: a },
  { lat: a, lng: a },
];
const withHole: Zone = [ring(0, 1), ring(0.4, 0.6)];

describe('pointInZone', () => {
  test('içeride, dışarıda ve delikte', () => {
    expect(pointInZone({ lat: 0.2, lng: 0.2 }, withHole)).toBe(true);
    expect(pointInZone({ lat: 1.5, lng: 0.5 }, withHole)).toBe(false);
    expect(pointInZone({ lat: 0.5, lng: 0.5 }, withHole)).toBe(false);
  });
});

describe('distanceToZone', () => {
  test('içerideyse 0, dışarıdaysa en yakın kenara uzaklık', () => {
    expect(distanceToZone({ lat: 0.2, lng: 0.2 }, withHole)).toBe(0);
    // Deliğin ortası: deliğin kenarına 0,1° (enlem) ≈ 11 km
    expect(distanceToZone({ lat: 0.5, lng: 0.5 }, withHole)).toBeCloseTo(0.1 * 110_540, -2);
  });
});

describe('areaToZone / zonesOfType', () => {
  const area = (id: string, type: Area['type']): Area => ({
    id,
    name: id,
    type,
    createdAt: '',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [29, 41],
          [29.1, 41],
          [29.1, 41.1],
          [29, 41],
        ],
      ],
    },
  });

  test('GeoJSON [boylam, enlem] sırası {lat, lng} olur', () => {
    expect(areaToZone(area('a', 'PARKING'))[0][1]).toEqual({ lat: 41, lng: 29.1 });
  });

  test('sadece istenen tipteki alanlar', () => {
    expect(zonesOfType([area('a', 'PARKING'), area('b', 'NO_RIDE'), area('c', 'PARKING')], 'PARKING')).toHaveLength(2);
  });
});
