import type { DeviceLogEntry } from './useOutbox';

const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Cihaz ile servis arasındaki alışverişin kaydı: ne gönderildi, sunucu ne dedi. */
export function DeviceLog({ entries }: { entries: DeviceLogEntry[] }) {
  return (
    <section className="device-log">
      <h2>Cihaz günlüğü</h2>
      {entries.length ? (
        <ol>
          {entries.map((e) => (
            <li key={e.id} className={`device-log__item device-log__item--${e.kind}`}>
              <time dateTime={e.at.toISOString()}>{timeFmt.format(e.at)}</time>
              <span>{e.text}</span>
              {e.requestId ? <small title="x-request-id">{e.requestId.slice(0, 8)}</small> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">Henüz gönderim yok.</p>
      )}
    </section>
  );
}
