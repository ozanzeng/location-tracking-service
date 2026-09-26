import { describe, expect, test } from 'vitest';
import { distance, pathLength, pointAlong } from './latlng';

const A = { lat: 41, lng: 29 };
const B = { lat: 41.001, lng: 29 }; // ~110,5 m kuzey
const C = { lat: 41.001, lng: 29.001 }; // B'nin ~84 m doğusu

describe('distance / pathLength', () => {
  test('kuzey-güney 0,001° ≈ 110,5 m', () => {
    expect(distance(A, B)).toBeCloseTo(110.54, 1);
  });

  test('çizgi uzunluğu parçaların toplamıdır', () => {
    expect(pathLength([A, B, C])).toBeCloseTo(distance(A, B) + distance(B, C), 6);
    expect(pathLength([A])).toBe(0);
  });
});

describe('pointAlong', () => {
  test('başlangıç, ara nokta ve köşeyi dönen nokta', () => {
    expect(pointAlong([A, B, C], 0)).toEqual(A);
    const half = pointAlong([A, B], distance(A, B) / 2)!;
    expect(half.lat).toBeCloseTo(41.0005, 9);
    const afterCorner = pointAlong([A, B, C], distance(A, B) + distance(B, C) / 2)!;
    expect(afterCorner.lat).toBeCloseTo(41.001, 9);
    expect(afterCorner.lng).toBeCloseTo(29.0005, 9);
  });

  test('çizginin sonunu geçince null', () => {
    expect(pointAlong([A, B], distance(A, B) + 1)).toBeNull();
  });

  test('uzunluğu sıfır parçayı atlar', () => {
    expect(pointAlong([A, A, B], 10)).not.toBeNull();
  });
});
