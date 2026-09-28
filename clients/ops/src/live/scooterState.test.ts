import { describe, expect, test } from 'vitest';
import { SCOOTER_ACTIVE_MS, SCOOTER_IDLE_MS } from '../config';
import { isNewerPosition, sameCounts, silence } from './scooterState';

describe('isNewerPosition', () => {
  test('ilk konum her zaman uygulanır', () => {
    expect(isNewerPosition(undefined, 1000)).toBe(true);
  });

  test('açılış yüklemesinden geç gelen eski konum canlı konumu ezmez', () => {
    const live = Date.parse('2026-09-28T10:00:05Z');
    const initialLoad = Date.parse('2026-09-28T09:59:10Z');
    expect(isNewerPosition(live, initialLoad)).toBe(false);
    expect(isNewerPosition(initialLoad, live)).toBe(true);
  });
});

describe('silence', () => {
  const now = 1_000_000;
  test.each([
    [0, 'active'],
    [SCOOTER_IDLE_MS, 'active'],
    [SCOOTER_IDLE_MS + 1, 'idle'],
    [SCOOTER_ACTIVE_MS + 1, 'gone'],
  ] as const)('%i ms sessiz → %s', (silent, expected) => {
    expect(silence(now, now - silent)).toBe(expected);
  });
});

describe('sameCounts', () => {
  test('aynı sayaçlar yeniden yayınlanmaz, değişen yayınlanır', () => {
    expect(sameCounts(null, { total: 0, outside: 0 })).toBe(false);
    expect(sameCounts({ total: 2, outside: 1, PARKING: 1 }, { total: 2, outside: 1, PARKING: 1 })).toBe(true);
    expect(sameCounts({ total: 2, outside: 1 }, { total: 2, outside: 0 })).toBe(false);
    // Eksik tip 0 sayılır.
    expect(sameCounts({ total: 1, outside: 0, SLOW: 0 }, { total: 1, outside: 0 })).toBe(true);
    expect(sameCounts({ total: 1, outside: 0 }, { total: 1, outside: 0, SLOW: 1 })).toBe(false);
  });
});
