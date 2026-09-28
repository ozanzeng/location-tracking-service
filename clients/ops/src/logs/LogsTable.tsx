import { memo } from 'react';
import { ExitReason, type LogEntry } from '@shared/api/types';
import { SignIcon } from '@shared/zones/SignIcon';
import { formatDuration } from './duration';

/** Çıkış alandan dışarı konum gelmeden kaydedildiyse sebebi (normal çıkışta etiket yok). */
const EXIT_REASONS: Record<ExitReason, { label: string; title: string }> = {
  [ExitReason.SIGNAL_LOST]: {
    label: 'Sinyal kaybı',
    title: 'Scooter uzun süre konum göndermedi; kayıt son sinyal anıyla kapatıldı. Gerçek çıkış bundan sonra olabilir.',
  },
  [ExitReason.AREA_CHANGED]: {
    label: 'Alan değişti',
    title: "Alanın şekli değiştirildi ve scooter'ın son konumu yeni şeklin dışında kaldı.",
  },
  [ExitReason.AREA_REMOVED]: { label: 'Alan silindi', title: 'Alan silindiği için kayıt kapatıldı.' },
};

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
  onOpenScooter,
}: {
  rows: LogEntry[];
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
              {r.exitTime ? (
                <>
                  <time dateTime={r.exitTime}>{dateFmt.format(new Date(r.exitTime))}</time>
                  {r.exitReason ? (
                    <span className="badge badge--warn" title={EXIT_REASONS[r.exitReason].title}>
                      {EXIT_REASONS[r.exitReason].label}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="badge">İçeride</span>
              )}
            </td>
            <td className="num">{r.exitTime ? formatDuration(r.entryTime, r.exitTime) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});
