import { describe, expect, test } from 'vitest';
import type { LogEntry } from '@shared/api/types';
import { logsToFeed, mergeFeed } from './logsToFeed';

const log = (id: string, entryTime: string, exitTime: string | null): LogEntry => ({
  id,
  userId: 'u1',
  areaId: 'a1',
  areaName: 'Moda',
  areaType: 'NO_RIDE',
  entryTime,
  exitTime,
  exitReason: null,
});

describe('logsToFeed', () => {
  test('çıkışı olan kayıt iki olay, açık kayıt tek olay üretir; en yeni başta', () => {
    const feed = logsToFeed([
      log('1', '2026-01-01T10:00:00Z', '2026-01-01T10:05:00Z'),
      log('2', '2026-01-01T10:10:00Z', null),
    ]);
    expect(feed.map((f) => [f.key, f.eventType])).toEqual([
      ['2-ENTER', 'ENTER'],
      ['1-EXIT', 'EXIT'],
      ['1-ENTER', 'ENTER'],
    ]);
  });
});

describe('mergeFeed', () => {
  test('canlı olaylar önde kalır, geçmişteki tekrarlar atılır, sınır uygulanır', () => {
    const live = logsToFeed([log('2', '2026-01-01T10:10:00Z', null)]);
    const history = logsToFeed([log('2', '2026-01-01T10:10:00Z', null), log('1', '2026-01-01T10:00:00Z', null)]);
    expect(mergeFeed(live, history, 10).map((f) => f.key)).toEqual(['2-ENTER', '1-ENTER']);
    expect(mergeFeed(live, history, 1).map((f) => f.key)).toEqual(['2-ENTER']);
  });
});
