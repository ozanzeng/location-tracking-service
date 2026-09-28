import { EventType, ExitReason, type AreaType, type LogEntry } from '@shared/api/types';

export interface FeedItem {
  key: string;
  userId: string;
  eventType: EventType;
  areaName: string;
  areaType: AreaType;
  at: string;
}

/**
 * Giriş kayıtlarını olay akışına çevirir: her kayıt bir giriş, çıkış zamanı varsa bir de
 * çıkış olayıdır. Sinyali kesildiği için kapanan kayıt çıkış sayılmaz (kullanıcı alandan
 * çıkmadı, konumu gelmedi). En yeni olay başta.
 */
export function logsToFeed(logs: LogEntry[]): FeedItem[] {
  return logs
    .flatMap((l) => {
      const base = { userId: l.userId, areaName: l.areaName, areaType: l.areaType };
      const enter: FeedItem = {
        ...base,
        key: `${l.id}-${EventType.ENTER}`,
        eventType: EventType.ENTER,
        at: l.entryTime,
      };
      const exit: FeedItem | null =
        l.exitTime && l.exitReason !== ExitReason.SIGNAL_LOST
          ? { ...base, key: `${l.id}-${EventType.EXIT}`, eventType: EventType.EXIT, at: l.exitTime }
          : null;
      return exit ? [exit, enter] : [enter];
    })
    .toSorted((a, b) => b.at.localeCompare(a.at));
}

/** Canlı akıştan önce gelen olaylar varsa geçmişle birleştirir, tekrarları atar. */
export function mergeFeed(live: FeedItem[], history: FeedItem[], limit: number): FeedItem[] {
  const seen = new Set(live.map((f) => f.key));
  return [...live, ...history.filter((h) => !seen.has(h.key))].slice(0, limit);
}
