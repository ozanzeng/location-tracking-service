import { describe, expect, test } from 'vitest';
import { formatDuration } from './duration';
import { EMPTY_FILTERS, isEmpty, toLogQuery } from './logFilters';

describe('formatDuration', () => {
  test.each([
    ['2026-01-01T10:00:00Z', '2026-01-01T10:00:45Z', '45 sn'],
    ['2026-01-01T10:00:00Z', '2026-01-01T10:03:12Z', '3 dk 12 sn'],
    ['2026-01-01T10:00:00Z', '2026-01-01T11:05:00Z', '1 sa 5 dk'],
    ['2026-01-01T10:00:10Z', '2026-01-01T10:00:00Z', '0 sn'],
  ])('%s → %s = %s', (entry, exit, expected) => {
    expect(formatDuration(entry, exit)).toBe(expected);
  });
});

describe('toLogQuery', () => {
  test('boş filtreler sadece sayfa boyutunu gönderir', () => {
    expect(toLogQuery(EMPTY_FILTERS)).toEqual({
      userId: undefined,
      areaId: undefined,
      active: undefined,
      from: undefined,
      to: undefined,
      limit: 50,
    });
    expect(isEmpty(EMPTY_FILTERS)).toBe(true);
  });

  test('durum active parametresine, yerel saat UTC ISO zamanına çevrilir', () => {
    const q = toLogQuery({ ...EMPTY_FILTERS, userId: ' scooter-1 ', status: 'inside', from: '2026-01-01T10:00' });
    expect(q.userId).toBe('scooter-1');
    expect(q.active).toBe(true);
    expect(q.from).toBe(new Date('2026-01-01T10:00').toISOString());
    expect(toLogQuery({ ...EMPTY_FILTERS, status: 'left' }).active).toBe(false);
  });
});
