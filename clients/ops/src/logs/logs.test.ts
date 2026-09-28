import { describe, expect, test } from 'vitest';
import { formatAgo, formatDuration } from './duration';
import { isEmpty, toLogQuery } from './logFilters';
import { visitStatus } from './visitStatus';
import { EMPTY_FILTERS } from './logs.constants';
import { VisitStatus } from './logs.types';

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

describe('formatAgo', () => {
  const now = Date.parse('2026-01-02T12:00:00Z');
  test.each([
    ['2026-01-02T11:59:20Z', '40 sn önce'],
    ['2026-01-02T11:55:00Z', '5 dk önce'],
    ['2026-01-02T09:30:00Z', '2 sa önce'],
    ['2025-12-30T12:00:00Z', '3 gün önce'],
    ['2026-01-02T12:00:05Z', '0 sn önce'],
  ])('%s → %s', (from, expected) => {
    expect(formatAgo(from, now)).toBe(expected);
  });
});

describe('visitStatus', () => {
  const now = Date.parse('2026-01-02T12:00:00Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
  const open = (lastSeenAt: string | null) => ({ exitTime: null, exitReason: null, lastSeenAt });

  test("açık giriş: konum geliyorsa içeride, 15 sn'dir gelmiyorsa sinyal yok", () => {
    expect(visitStatus(open(ago(5)), now)).toBe(VisitStatus.INSIDE);
    expect(visitStatus(open(ago(15)), now)).toBe(VisitStatus.INSIDE);
    expect(visitStatus(open(ago(16)), now)).toBe(VisitStatus.NO_SIGNAL);
    // Eski sunucu alanı göndermiyorsa bilinen durum gösterilir.
    expect(visitStatus(open(null), now)).toBe(VisitStatus.INSIDE);
  });

  test('kapanmış giriş: çıkış sebebine göre', () => {
    const closed = { exitTime: ago(100), lastSeenAt: null };
    expect(visitStatus({ ...closed, exitReason: 'LEFT' }, now)).toBe(VisitStatus.LEFT);
    expect(visitStatus({ ...closed, exitReason: 'SIGNAL_LOST' }, now)).toBe(VisitStatus.SIGNAL_LOST);
  });
});
