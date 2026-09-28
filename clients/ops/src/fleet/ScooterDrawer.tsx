import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@shared/api/client';
import { DeviceLogResult, EventType, RentalEndReason, ScooterStatus, type ScooterDetail } from '@shared/api/types';
import { SignIcon } from '@shared/zones/SignIcon';
import { SCOOTER_DETAIL_REFRESH_MS } from '../config';
import { formatAgo, formatDuration } from '../logs/duration';

const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const END_REASONS: Record<RentalEndReason, string> = {
  [RentalEndReason.RETURNED]: 'bıraktı',
  [RentalEndReason.SIGNAL_LOST]: 'sinyal kaybı',
};

function StatusBadge({ detail }: { detail: ScooterDetail }) {
  if (!detail.registered) {
    return <span className="badge badge--warn">{detail.removedAt ? 'Filodan çıkarıldı' : 'Filoda kayıtlı değil'}</span>;
  }
  return detail.status === ScooterStatus.IN_USE ? (
    <span className="badge badge--busy">Kullanımda{detail.rider ? `: ${detail.rider.username}` : ''}</span>
  ) : (
    <span className="badge">Boşta</span>
  );
}

/**
 * Sağdan açılan scooter paneli: durum, son sinyal, içinde bulunduğu alanlar, sunucunun işlediği
 * son konumlar (cihaz günlüğü) ve son kiralamalar. Scooter 5 sn'de bir gönderdiği için panel
 * açıkken aynı aralıkla yenilenir. Esc ya da × ile kapanır; tablo arkada kullanılabilir kalır.
 */
export function ScooterDrawer({
  scooterId,
  onClose,
  onFilter,
}: {
  scooterId: string;
  onClose: () => void;
  /** Kayıtlar tablosunu bu scooter'la filtrele. */
  onFilter: (scooterId: string) => void;
}) {
  const [detail, setDetail] = useState<ScooterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await api.scooterDetail(scooterId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'Bu scooter için kayıt yok.' : (err as Error).message);
    } finally {
      setNow(Date.now());
    }
  }, [scooterId]);

  useEffect(() => {
    setDetail(null);
    void load();
    const timer = setInterval(() => void load(), SCOOTER_DETAIL_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Açılınca odak panele gelsin (klavye ve ekran okuyucu); Esc kapatır.
  useEffect(() => {
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scooterId, onClose]);

  return (
    <aside className="drawer" aria-labelledby="drawer-title">
      <header className="drawer__head">
        <div>
          <h2 id="drawer-title" ref={heading} tabIndex={-1}>
            <span className="plate">{scooterId}</span>
            {detail?.name && detail.name !== scooterId ? <span className="drawer__name">{detail.name}</span> : null}
          </h2>
          {detail ? <StatusBadge detail={detail} /> : null}
        </div>
        <button type="button" className="drawer__close" aria-label="Paneli kapat" onClick={onClose}>
          ×
        </button>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {!detail && !error ? <p className="hint">Yükleniyor</p> : null}

      {detail ? (
        <>
          <section className="drawer__section">
            <h3>Konum</h3>
            {detail.lastLocation ? (
              <p>
                Son sinyal{' '}
                <time
                  dateTime={detail.lastLocation.recordedAt}
                  title={new Date(detail.lastLocation.recordedAt).toLocaleString('tr-TR')}
                >
                  {formatAgo(detail.lastLocation.recordedAt, now)}
                </time>
                <br />
                <small className="num">
                  {detail.lastLocation.lat.toFixed(5)}, {detail.lastLocation.lng.toFixed(5)}
                </small>
              </p>
            ) : (
              <p className="hint">Hiç konum göndermedi.</p>
            )}
            {detail.currentAreas.length ? (
              <ul className="zones">
                {detail.currentAreas.map((a) => (
                  <li key={a.id}>
                    <SignIcon type={a.type} size={20} />
                    <span>{a.name}</span>
                    <small>{formatAgo(a.since, now)} girdi</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Şu an hiçbir alanın içinde değil.</p>
            )}
          </section>

          <section className="drawer__section">
            <h3>Cihaz günlüğü</h3>
            <p className="hint">Sunucunun bu scooter'dan aldığı ve işlediği son konumlar, en yeni başta.</p>
            {detail.deviceLog.length ? (
              <ol className="device-feed">
                {detail.deviceLog.map((e, i) => (
                  <li key={`${e.processedAt}-${i}`} data-result={e.result}>
                    <time dateTime={e.processedAt} className="num">
                      {timeFmt.format(new Date(e.processedAt))}
                    </time>
                    <span>
                      {e.result === DeviceLogResult.STALE ? (
                        <strong>Eski konum, atlandı</strong>
                      ) : e.events.length ? (
                        e.events.map((ev) => (
                          <strong key={`${ev.type}-${ev.area.id}`} className="device-feed__event">
                            {ev.type === EventType.ENTER ? 'Girdi' : 'Çıktı'}: {ev.area.name}
                          </strong>
                        ))
                      ) : (
                        'Konum işlendi'
                      )}
                      <small className="num">
                        cihaz saati {timeFmt.format(new Date(e.recordedAt))} · gecikme{' '}
                        {formatDuration(e.recordedAt, e.processedAt)}
                        {e.requestId ? ` · istek ${e.requestId.slice(0, 8)}` : ''}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="hint">Son 24 saatte işlenmiş konum yok.</p>
            )}
          </section>

          <section className="drawer__section">
            <h3>Son kiralamalar</h3>
            {detail.rentals.length ? (
              <ul className="rental-list">
                {detail.rentals.map((r) => (
                  <li key={r.startedAt}>
                    <strong>{r.username}</strong>
                    <span className="num">
                      {dateFmt.format(new Date(r.startedAt))} →{' '}
                      {r.endedAt ? `${dateFmt.format(new Date(r.endedAt))} (${END_REASONS[r.endReason!]})` : 'sürüyor'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Hiç kiralanmadı.</p>
            )}
          </section>

          <button type="button" className="btn" onClick={() => onFilter(scooterId)}>
            Bu scooter'ın giriş kayıtlarını göster
          </button>
        </>
      ) : null}
    </aside>
  );
}
