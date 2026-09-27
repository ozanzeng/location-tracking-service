import { NoticeKind, type RouteNotice } from './useRoutePlanner';

/** Scooter'ı hareket ettirme biçimi. */
export const MoveMode = { DRAG: 'drag', ROUTE: 'route' } as const;
export type MoveMode = (typeof MoveMode)[keyof typeof MoveMode];

const MODE_LABELS: Record<MoveMode, string> = { [MoveMode.DRAG]: 'Sürükle', [MoveMode.ROUTE]: 'Rota çiz' };

interface Props {
  mode: MoveMode;
  onModeChange: (mode: MoveMode) => void;
  playing: boolean;
  onTogglePlay: () => void;
  speedKmh: number;
  onSpeedChange: (kmh: number) => void;
  stopCount: number;
  lengthMeters: number;
  roadsReady: boolean;
  roadsError: string | null;
  notice: RouteNotice | null;
  onClear: () => void;
}

/** Scooter'ı hareket ettirme: sürükleme ya da rota çizip oynatma. */
export function MovementPanel(props: Props) {
  const { mode, onModeChange, playing, stopCount } = props;
  return (
    <section className="field">
      <span className="field__label" id="mode-label">
        Hareket
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby="mode-label">
        {Object.values(MoveMode).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={playing}
            onClick={() => onModeChange(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      {mode === MoveMode.DRAG ? (
        <p className="hint">Scooter'ı haritada sürükleyin; yol üzerinde kalır.</p>
      ) : (
        <RouteControls {...props} hasRoute={stopCount > 0} />
      )}
    </section>
  );
}

function RouteControls({
  playing,
  onTogglePlay,
  speedKmh,
  onSpeedChange,
  stopCount,
  lengthMeters,
  roadsReady,
  roadsError,
  notice,
  onClear,
  hasRoute,
}: Props & { hasRoute: boolean }) {
  return (
    <div className="route">
      <p className="hint">
        {stopCount
          ? `${stopCount} durak, yol üzerinden ${(lengthMeters / 1000).toFixed(2)} km. Silmek için durağa tekrar tıklayın.`
          : roadsReady
            ? 'Haritada bir yola tıklayarak durak ekleyin. Rota yolları takip eder.'
            : (roadsError ?? 'Yol haritası yükleniyor')}
      </p>
      {notice ? <p className={notice.kind === NoticeKind.ERROR ? 'error' : 'notice'}>{notice.text}</p> : null}
      <div className="row">
        <label htmlFor="speed" className="sr-only">
          Hız
        </label>
        <select id="speed" value={speedKmh} disabled={playing} onChange={(e) => onSpeedChange(Number(e.target.value))}>
          <option value={15}>15 km/s</option>
          <option value={25}>25 km/s</option>
          <option value={80}>80 km/s (hızlı demo)</option>
        </select>
        <button type="button" className="btn btn--primary" disabled={!hasRoute && !playing} onClick={onTogglePlay}>
          {playing ? 'Durdur' : 'Rotayı oynat'}
        </button>
      </div>
      <button type="button" className="btn btn--quiet" disabled={!hasRoute || playing} onClick={onClear}>
        Rotayı temizle
      </button>
    </div>
  );
}
