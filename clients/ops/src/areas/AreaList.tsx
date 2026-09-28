import { useState } from 'react';
import type { Area } from '@shared/api/types';
import { SignIcon } from '@shared/zones/SignIcon';
import { ZONES } from '@shared/zones/zoneStyles';

interface Props {
  areas: Area[];
  error: string | null;
  /** Düzenlenen alan: satırı işaretli, işlem düğmeleri kapalı. */
  editingId: string | null;
  /** Çizim ya da kayıt sürerken işlem yapılmaz. */
  busy: boolean;
  onEdit: (area: Area) => void;
  onDelete: (area: Area) => void;
}

/**
 * Tanımlı alanlar; her biri düzenlenebilir ve silinebilir. Silme iki adımlı (sayfa içinde
 * onay): içindeki scooterların girişleri kapanır, yanlışlıkla tıklama bunu yapmasın.
 */
export function AreaList({ areas, error, editingId, busy, onEdit, onDelete }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <section className="field">
      <h2>Tanımlı alanlar ({areas.length})</h2>
      {error ? <p className="error">Alanlar yüklenemedi: {error}</p> : null}
      <ul className="zones area-list">
        {areas.map((a) => (
          <li key={a.id} aria-current={a.id === editingId ? 'true' : undefined}>
            <SignIcon type={a.type} size={22} />
            <span>
              {a.name}
              <small>{ZONES[a.type].label}</small>
            </span>
            {confirming === a.id ? (
              <span className="area-list__confirm" role="group" aria-label={`${a.name} silinsin mi`}>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => {
                    setConfirming(null);
                    onDelete(a);
                  }}
                >
                  Evet, sil
                </button>
                <button type="button" className="btn btn--quiet" onClick={() => setConfirming(null)}>
                  Vazgeç
                </button>
              </span>
            ) : (
              <span className="area-list__actions">
                <button type="button" className="btn" disabled={busy} onClick={() => onEdit(a)}>
                  Düzenle
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(a.id)}>
                  Sil
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {confirming ? (
        <p className="hint">
          Silinen alan haritalardan kalkar; içindeki scooterların girişleri kapatılır. Geçmiş giriş kayıtları durur.
        </p>
      ) : null}
      {!areas.length && !error ? <p className="hint">Henüz alan yok. İlk alanı haritaya çizerek ekleyin.</p> : null}
    </section>
  );
}
