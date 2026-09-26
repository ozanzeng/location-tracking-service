import { describe, expect, test } from 'vitest';
import type { AreaRef } from '@shared/api/types';
import { riderZone } from './riderZone';
import { riderMessage } from './riderMessages';

const ref = (type: AreaRef['type']): AreaRef => ({ id: type, name: type, type });

describe('riderZone', () => {
  test('sürüş yoksa boş halka', () => {
    expect(riderZone(false, [ref('NO_RIDE')])).toBe('IDLE');
  });

  test('hizmet bölgesi dışında gri', () => {
    expect(riderZone(true, [])).toBe('NONE');
    expect(riderZone(true, [ref('PARKING')])).toBe('NONE');
  });

  test('en kısıtlayıcı bölge kazanır', () => {
    expect(riderZone(true, [ref('SERVICE'), ref('PARKING'), ref('SLOW')])).toBe('SLOW');
    expect(riderZone(true, [ref('SERVICE')])).toBe('SERVICE');
    expect(riderZone(true, [ref('NO_RIDE')])).toBe('NO_RIDE');
  });
});

describe('riderMessage', () => {
  test('her bölge tipi ve olay için başlık ve açıklama var', () => {
    for (const type of ['NO_RIDE', 'SLOW', 'NO_PARKING', 'PARKING', 'SERVICE'] as const) {
      for (const event of ['ENTER', 'EXIT'] as const) {
        const m = riderMessage(type, event);
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.body.length).toBeGreaterThan(0);
      }
    }
  });
});
