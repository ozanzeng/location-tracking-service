import { describe, expect, test } from 'vitest';
import type { AreaType } from '@shared/api/types';
import { scooterColor } from './scooterColor';
import { countScooters } from './scooterCounts';

const GRAY = '#8A8F98';
const s = (...types: AreaType[]) => ({ types });

describe('countScooters', () => {
  test('hizmet bölgesi dışında sayısı haritadaki gri noktalarla aynıdır', () => {
    const scooters = [
      s('SERVICE'),
      s('SERVICE', 'PARKING'),
      s(), // hiçbir bölgede değil
      s('PARKING'), // hizmet bölgesi dışına taşan park alanı
      s('NO_RIDE'), // hizmet bölgesi dışına taşan yasak bölge: kırmızı, gri değil
    ];
    const counts = countScooters(scooters);
    const gray = scooters.filter((x) => scooterColor(x.types) === GRAY).length;
    expect(counts.outside).toBe(gray);
    expect(counts.outside).toBe(2);
    expect(counts).toMatchObject({ total: 5, SERVICE: 2, NO_RIDE: 1, PARKING: 2 });
  });

  test('aynı tip iki kez gelirse bir kez sayılır', () => {
    expect(countScooters([s('SERVICE', 'SERVICE')])).toEqual({ total: 1, outside: 0, SERVICE: 1 });
  });
});
