import { useState } from 'react';
import { ScooterStatus, type Scooter } from '@shared/api/types';
import { formatDuration } from '../logs/duration';

const dateFmt = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** "3 dk 12 sn önce"; saat farkıyla gelecekte görünen zaman "az önce". */
function ago(iso: string, now: number): string {
  return Date.parse(iso) >= now ? 'az önce' : `${formatDuration(iso, new Date(now).toISOString())} önce`;
}

interface Props {
  scooters: Scooter[];
  /** Silme sürerken satırın düğmeleri kapalı. */
  removing: string | null;
  onRemove: (id: string) => void;
}

/**
 * Filo tablosu. Silme iki adımlı (sayfa içinde onay): yanlışlıkla tıklama scooter'ı
 * silmesin. Kullanımdaki scooter silinemez; sunucu da reddeder.
 */
export function FleetTable({ scooters, removing, onRemove }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const now = Date.now();

  return (
    <table className="logs">
      <thead>
        <tr>
          <th scope="col">Scooter</th>
          <th scope="col">Durum</th>
          <th scope="col">Kiralama başlangıcı</th>
          <th scope="col">Son sinyal</th>
          <th scope="col">
            <span className="sr-only">İşlem</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {scooters.map((s) => {
          const inUse = s.status === ScooterStatus.IN_USE;
          return (
            <tr key={s.id} data-status={s.status}>
              <td>
                <span className="fleet__id">
                  <span className="plate">{s.id}</span>
                  {s.name !== s.id ? <span>{s.name}</span> : null}
                </span>
              </td>
              <td>
                {inUse ? (
                  <span className="badge badge--busy">Kullanımda{s.rider ? `: ${s.rider.username}` : ''}</span>
                ) : (
                  <span className="badge">Boşta</span>
                )}
              </td>
              <td className="num">
                {s.rider ? <time dateTime={s.rider.since}>{dateFmt.format(new Date(s.rider.since))}</time> : ''}
              </td>
              <td className="num">
                {s.lastSeenAt ? (
                  <time dateTime={s.lastSeenAt} title={new Date(s.lastSeenAt).toLocaleString('tr-TR')}>
                    {ago(s.lastSeenAt, now)}
                  </time>
                ) : (
                  <span className="hint">Hiç konum yok</span>
                )}
              </td>
              <td className="fleet__actions">
                {confirming === s.id ? (
                  <span className="row">
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={removing === s.id}
                      onClick={() => {
                        setConfirming(null);
                        onRemove(s.id);
                      }}
                    >
                      Evet, sil
                    </button>
                    <button type="button" className="btn btn--quiet" onClick={() => setConfirming(null)}>
                      Vazgeç
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={inUse || removing === s.id}
                    title={inUse ? 'Kullanımdaki scooter silinemez; sürüş bitince silinebilir' : undefined}
                    onClick={() => setConfirming(s.id)}
                  >
                    {removing === s.id ? 'Siliniyor' : 'Sil'}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
