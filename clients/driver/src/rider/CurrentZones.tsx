import type { AreaRef } from '@shared/api/types';
import { SignIcon } from '@shared/zones/SignIcon';
import { ZONES } from '@shared/zones/zoneStyles';

/** Scooter'ın sunucuya göre şu an içinde bulunduğu bölgeler. */
export function CurrentZones({ areas, riding }: { areas: AreaRef[]; riding: boolean }) {
  return (
    <section className="field">
      <span className="field__label">Bulunduğunuz bölgeler</span>
      {areas.length ? (
        <ul className="zones">
          {areas.map((a) => (
            <li key={a.id}>
              <SignIcon type={a.type} size={22} />
              <span>{a.name}</span>
              <small>{ZONES[a.type].label}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{riding ? 'Hiçbir bölgede değilsiniz.' : 'Sürüş başlayınca burada görünür.'}</p>
      )}
    </section>
  );
}
