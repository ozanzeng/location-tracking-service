import type { Area } from '@shared/api/types';
import { SignIcon } from '@shared/zones/SignIcon';
import { ZONES } from '@shared/zones/zoneStyles';

/** Tanımlı alanlar listesi. */
export function AreaList({ areas, error }: { areas: Area[]; error: string | null }) {
  return (
    <section className="field">
      <h2>Tanımlı alanlar ({areas.length})</h2>
      {error ? <p className="error">Alanlar yüklenemedi: {error}</p> : null}
      <ul className="zones">
        {areas.map((a) => (
          <li key={a.id}>
            <SignIcon type={a.type} size={22} />
            <span>{a.name}</span>
            <small>{ZONES[a.type].label}</small>
          </li>
        ))}
      </ul>
      {!areas.length && !error ? <p className="hint">Henüz alan yok. İlk alanı haritaya çizerek ekleyin.</p> : null}
    </section>
  );
}
