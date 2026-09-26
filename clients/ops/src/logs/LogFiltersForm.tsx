import type { Area } from '@shared/api/types';
import type { LogFilters } from './logFilters';

interface Props {
  value: LogFilters;
  areas: Area[];
  onChange: (value: LogFilters) => void;
  onSubmit: () => void;
  onReset: () => void;
}

/** Giriş kayıtları filtreleri: kullanıcı, alan, durum ve giriş zamanı aralığı. */
export function LogFiltersForm({ value, areas, onChange, onSubmit, onReset }: Props) {
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
        Kullanıcı
        <input value={value.userId} placeholder="scooter-42" onChange={(e) => set('userId', e.target.value)} />
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
          <option value="all">Tümü</option>
          <option value="inside">Hâlâ içeride</option>
          <option value="left">Çıkmış</option>
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
