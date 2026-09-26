import { describe, expect, test } from 'vitest';
import type { Area, AreaType } from '@shared/api/types';
import { endRideBlocker } from './endRideRules';

/** [minLng, minLat, maxLng, maxLat] kutusundan alan. */
const area = (name: string, type: AreaType, [w, s, e, n]: number[]): Area => ({
  id: name,
  name,
  type,
  createdAt: '',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  },
});

const parking = area('Moda Park', 'PARKING', [29.0, 41.0, 29.001, 41.001]);
const noParking = area('Altıyol', 'NO_PARKING', [29.01, 41.0, 29.011, 41.001]);

describe('endRideBlocker', () => {
  test('park alanının içinde sürüş biter', () => {
    expect(endRideBlocker({ lat: 41.0005, lng: 29.0005 }, [parking, noParking])).toBeNull();
  });

  test('park yasak bölgede bitmez', () => {
    expect(endRideBlocker({ lat: 41.0005, lng: 29.0105 }, [parking, noParking])).toMatch(/Park yasak bölgede/);
  });

  test('park alanı dışında bitmez; en yakın park alanı ve uzaklığı söylenir', () => {
    // Park alanının doğu kenarından ~0,002° (~170 m) doğuda
    const message = endRideBlocker({ lat: 41.0005, lng: 29.003 }, [parking, noParking]);
    expect(message).toMatch(/Sürüş sadece park alanlarında bitirilebilir/);
    expect(message).toMatch(/En yakın park alanı: Moda Park, yaklaşık 170 m/);
  });

  test('park alanı ile park yasağı çakışırsa park yasağı kazanır', () => {
    const overlap = area('Çakışan yasak', 'NO_PARKING', [29.0, 41.0, 29.001, 41.001]);
    expect(endRideBlocker({ lat: 41.0005, lng: 29.0005 }, [parking, overlap])).toMatch(/Park yasak/);
  });

  test('hiç park alanı yoksa bunu söyler', () => {
    expect(endRideBlocker({ lat: 41, lng: 29 }, [])).toMatch(/tanımlı park alanı yok/);
  });
});
