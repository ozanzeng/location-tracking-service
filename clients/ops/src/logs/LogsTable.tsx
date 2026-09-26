import type { LogEntry } from '@shared/api/types';
import { SignIcon } from '@shared/zones/SignIcon';
import { formatDuration } from './duration';

const dateFmt = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Giriş kayıtları tablosu; kullanıcıya tıklamak o kullanıcıyla filtrelemeyi hazırlar. */
export function LogsTable({ rows, onPickUser }: { rows: LogEntry[]; onPickUser: (userId: string) => void }) {
  return (
    <table className="logs">
      <thead>
        <tr>
          <th scope="col">Kullanıcı</th>
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
                onClick={() => onPickUser(r.userId)}
                title="Bu kullanıcıyla filtrele"
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
                <time dateTime={r.exitTime}>{dateFmt.format(new Date(r.exitTime))}</time>
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
}
