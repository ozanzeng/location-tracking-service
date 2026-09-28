import { useEffect, useState } from 'react';
import { api } from '@shared/api/client';
import type { AreaEvent } from '@shared/api/types';
import { SocketEvent } from '@shared/realtime/events';
import { getSocket } from '@shared/realtime/socket';
import { FEED_HISTORY_SIZE as HISTORY_SIZE, FEED_LIMIT } from '../config';
import { logsToFeed, mergeFeed } from './logsToFeed';
import type { FeedItem } from './live.types';

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
    socket.on(SocketEvent.AREA_EVENT, onEvent);
    return () => {
      cancelled = true;
      socket.off(SocketEvent.AREA_EVENT, onEvent);
    };
  }, []);

  return feed;
}
