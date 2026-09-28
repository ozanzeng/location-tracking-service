import type { Area, Scooter } from '@shared/api/types';
import { LogStatusFilter, type LogFilters } from './logs.types';

interface Props {
  value: LogFilters;
  areas: Area[];
  /** Filodaki (kayıtlı) scooterlar; henüz yüklenmediyse null. */
  scooters: Scooter[] | null;
  onChange: (value: LogFilters) => void;
  onSubmit: () => void;
  onReset: () => void;
}

/** Giriş kayıtları filtreleri: scooter, alan, durum ve giriş zamanı aralığı. */
export function LogFiltersForm({ value, areas, scooters, onChange, onSubmit, onReset }: Props) {
  const set = <K extends keyof LogFilters>(key: K, v: LogFilters[K]) => onChange({ ...value, [key]: v });
  return (
    <form
      className="filters"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label>
        Scooter
        <select value={value.userId} onChange={(e) => set('userId', e.target.value)}>
          <option value="">Tüm scooterlar</option>
          {scooters?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name !== s.id ? `${s.id} · ${s.name}` : s.id}
            </option>
          ))}
          {/* Filodan çıkarılmış bir scooter detay panelinden seçildiyse de görünsün. */}
          {value.userId && scooters && !scooters.some((s) => s.id === value.userId) ? (
            <option value={value.userId}>{value.userId} (filoda değil)</option>
          ) : null}
        </select>
      </label>
      <label>
        Alan
        <select value={value.areaId} onChange={(e) => set('areaId', e.target.value)}>
          <option value="">Tüm alanlar</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Durum
        <select value={value.status} onChange={(e) => set('status', e.target.value as LogFilters['status'])}>
          <option value={LogStatusFilter.ALL}>Tümü</option>
          <option value={LogStatusFilter.INSIDE}>Hâlâ içeride</option>
          <option value={LogStatusFilter.LEFT}>Çıkmış</option>
        </select>
      </label>
      <label>
        Giriş, başlangıç
        <input type="datetime-local" value={value.from} onChange={(e) => set('from', e.target.value)} />
      </label>
      <label>
        Giriş, bitiş
        <input type="datetime-local" value={value.to} onChange={(e) => set('to', e.target.value)} />
      </label>
      <div className="filters__actions">
        <button type="submit" className="btn btn--primary">
          Filtrele
        </button>
        <button type="button" className="btn btn--quiet" onClick={onReset}>
          Temizle
        </button>
      </div>
    </form>
  );
}
