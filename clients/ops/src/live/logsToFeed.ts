import type { AreaType, LogEntry } from '@shared/api/types';

export interface FeedItem {
  key: string;
  userId: string;
  eventType: 'ENTER' | 'EXIT';
  areaName: string;
  areaType: AreaType;
  at: string;
}

/**
 * Giriş kayıtlarını olay akışına çevirir: her kayıt bir giriş, çıkış zamanı varsa bir de
 * çıkış olayıdır. En yeni olay başta.
 */
export function logsToFeed(logs: LogEntry[]): FeedItem[] {
  return logs
    .flatMap((l) => {
      const base = { userId: l.userId, areaName: l.areaName, areaType: l.areaType };
      const enter: FeedItem = { ...base, key: `${l.id}-ENTER`, eventType: 'ENTER', at: l.entryTime };
      return l.exitTime
        ? [{ ...base, key: `${l.id}-EXIT`, eventType: 'EXIT' as const, at: l.exitTime }, enter]
        : [enter];
    })
    .toSorted((a, b) => b.at.localeCompare(a.at));
}

/** Canlı akıştan önce gelen olaylar varsa geçmişle birleştirir, tekrarları atar. */
export function mergeFeed(live: FeedItem[], history: FeedItem[], limit: number): FeedItem[] {
  const seen = new Set(live.map((f) => f.key));
  return [...live, ...history.filter((h) => !seen.has(h.key))].slice(0, limit);
}
