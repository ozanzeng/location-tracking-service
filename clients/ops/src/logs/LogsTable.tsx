import { memo } from 'react';
import type { LogEntry } from '@shared/api/types';
import { SignIcon } from '@shared/zones/SignIcon';
import { formatAgo, formatDuration } from './duration';
import { visitStatus } from './visitStatus';
import { VisitStatus } from './logs.types';

const dateFmt = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * Giriş kayıtları tablosu; scooter'a tıklamak detay panelini açar.
 * memo: "daha fazla göster" ile satırlar yüzlerce olabilir; filtre formundaki her tuş vuruşu
 * ya da gelen her yeni giriş (sayaç) tabloyu baştan çizmesin. Satırlar değişince çizilir.
 */
export const LogsTable = memo(function LogsTable({
  rows,
  now,
  onOpenScooter,
}: {
  rows: LogEntry[];
  /** "Sinyal yok · X önce" için şimdiki zaman; dakikada birkaç kez değişir. */
  now: number;
  onOpenScooter: (scooterId: string) => void;
}) {
  return (
    <table className="logs">
      <thead>
        <tr>
          <th scope="col">Scooter</th>
          <th scope="col">Alan</th>
          <th scope="col">Giriş</th>
          <th scope="col">Çıkış</th>
          <th scope="col">Süre</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <button
                type="button"
                className="link"
                onClick={() => onOpenScooter(r.userId)}
                title="Scooter detayını ve cihaz günlüğünü aç"
              >
                {r.userId}
              </button>
            </td>
            <td>
              <span className="logs__area">
                <SignIcon type={r.areaType} size={20} />
                {r.areaName}
              </span>
            </td>
            <td className="num">
              <time dateTime={r.entryTime}>{dateFmt.format(new Date(r.entryTime))}</time>
            </td>
            <td className="num">
              <ExitCell entry={r} now={now} />
            </td>
            <td className="num">{r.exitTime ? formatDuration(r.entryTime, r.exitTime) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});

function ExitCell({ entry, now }: { entry: LogEntry; now: number }) {
  switch (visitStatus(entry, now)) {
    case VisitStatus.INSIDE:
      return <span className="badge">İçeride</span>;
    case VisitStatus.NO_SIGNAL:
      return (
        <span
          className="badge badge--muted"
          title={`Son konum ${dateFmt.format(new Date(entry.lastSeenAt!))}. Konum gelmediği için bilinen son durum "içeride".`}
        >
          Sinyal yok · {formatAgo(entry.lastSeenAt!, now)}
        </span>
      );
    case VisitStatus.SIGNAL_LOST:
      return (
        <>
          <time dateTime={entry.exitTime!}>{dateFmt.format(new Date(entry.exitTime!))}</time>{' '}
          <span
            className="badge badge--muted"
            title="Konumu 30 sn gelmediği için kapatıldı; çıkış zamanı kapatıldığı an."
          >
            sinyal kesildi
          </span>
        </>
      );
    case VisitStatus.AREA_CHANGED:
      return (
        <>
          <time dateTime={entry.exitTime!}>{dateFmt.format(new Date(entry.exitTime!))}</time>{' '}
          <span
            className="badge badge--muted"
            title="Alanın şekli değiştirildi ve scooter'ın son konumu yeni şeklin dışında kaldı; çıkış zamanı değişikliğin anı."
          >
            alan değişti
          </span>
        </>
      );
    case VisitStatus.AREA_REMOVED:
      return (
        <>
          <time dateTime={entry.exitTime!}>{dateFmt.format(new Date(entry.exitTime!))}</time>{' '}
          <span className="badge badge--muted" title="Alan silindiği için kapatıldı; çıkış zamanı silindiği an.">
            alan silindi
          </span>
        </>
      );
    case VisitStatus.LEFT:
      return <time dateTime={entry.exitTime!}>{dateFmt.format(new Date(entry.exitTime!))}</time>;
  }
}
