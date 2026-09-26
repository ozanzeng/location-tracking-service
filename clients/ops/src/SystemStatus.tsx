import { useEffect, useState } from 'react';
import { api } from '@shared/api/client';
import type { Health } from '@shared/api/types';

/** /health'ten servis durumu: veritabanı, Redis ve kuyrukta bekleyen konumlar. */
export function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = () =>
      api.health().then(
        (h) => {
          if (!active) return;
          setHealth(h);
          setUnreachable(false);
        },
        () => active && setUnreachable(true),
      );
    void poll();
    const timer = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (unreachable) return <p className="topbar__status status--down">Servise ulaşılamıyor</p>;
  if (!health) return null;
  const ok = health.status === 'ok';
  const waiting = health.queue ? health.queue.waiting + health.queue.active : 0;
  return (
    <p
      className={ok ? 'topbar__status' : 'topbar__status status--down'}
      title={`Veritabanı ${health.database}, Redis ${health.redis}`}
    >
      {ok
        ? `Servis çalışıyor, kuyrukta ${waiting.toLocaleString('tr-TR')} konum`
        : 'Servis sorunlu: veritabanı veya Redis kapalı'}
    </p>
  );
}
