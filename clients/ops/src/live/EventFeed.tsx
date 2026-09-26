import { SignIcon } from '@shared/zones/SignIcon';
import type { FeedItem } from './logsToFeed';

const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Giriş ve çıkışlar; bir satıra tıklamak haritayı o scooter'a götürür. */
export function EventFeed({ feed, onFocus }: { feed: FeedItem[]; onFocus: (userId: string) => void }) {
  return (
    <section className="feed">
      <h2>Giriş ve çıkışlar</h2>
      {feed.length ? (
        <ol>
          {feed.map((f) => (
            <li key={f.key} className={`feed__item feed__item--${f.eventType}`}>
              <SignIcon type={f.areaType} size={24} />
              <button type="button" onClick={() => onFocus(f.userId)} title="Haritada göster">
                <strong>{f.userId}</strong> {f.eventType === 'ENTER' ? 'girdi:' : 'çıktı:'} {f.areaName}
              </button>
              <time dateTime={f.at}>{timeFmt.format(new Date(f.at))}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">
          Henüz olay yok. Sürücü uygulamasında sürüş başlatıp scooter'ı renkli bir bölgeye götürün.
        </p>
      )}
    </section>
  );
}
