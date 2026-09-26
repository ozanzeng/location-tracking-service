import { useEffect, useState } from 'react';
import { api } from '@shared/api/client';
import type { AreaEvent } from '@shared/api/types';
import { getSocket } from '@shared/realtime/socket';
import { logsToFeed, mergeFeed, type FeedItem } from './logsToFeed';

const FEED_LIMIT = 60;
const HISTORY_SIZE = 40;

/** Giriş/çıkış akışı: açılışta son kayıtlar, ardından canlı olaylar. */
export function useEventFeed() {
  const [feed, setFeed] = useState<FeedItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.logs({ limit: HISTORY_SIZE }).then(
      ({ data }) => {
        if (!cancelled) setFeed((live) => mergeFeed(live, logsToFeed(data), FEED_LIMIT));
      },
      () => undefined,
    );

    const socket = getSocket();
    const onEvent = (e: AreaEvent) => {
      const item: FeedItem = {
        key: `${e.logId}-${e.eventType}`,
        userId: e.userId,
        eventType: e.eventType,
        areaName: e.area.name,
        areaType: e.area.type,
        at: e.occurredAt,
      };
      setFeed((list) => [item, ...list].slice(0, FEED_LIMIT));
    };
    socket.on('area-event', onEvent);
    return () => {
      cancelled = true;
      socket.off('area-event', onEvent);
    };
  }, []);

  return feed;
}
