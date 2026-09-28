import { useState } from 'react';
import { AREA_NAME_MAX_LENGTH } from '@shared/api/limits';
import { AreaType } from '@shared/api/types';
import { SignIcon } from '@shared/zones/SignIcon';
import { ZONES, ZONE_ORDER } from '@shared/zones/zoneStyles';

interface Props {
  saving: boolean;
  error: string | null;
  /** Düzenlemede alanın mevcut adı ve tipi. */
  initial?: { name: string; type: AreaType };
  submitLabel: string;
  discardLabel: string;
  /** Kayıt başarılıysa true döner; form temizlenir. */
  onSave: (name: string, type: AreaType) => Promise<boolean>;
  onDiscard: () => void;
}

/** Alanın adı ve tipi: yeni çizimde ve düzenlemede aynı form. */
export function AreaForm({ saving, error, initial, submitLabel, discardLabel, onSave, onDiscard }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<AreaType>(initial?.type ?? AreaType.NO_RIDE);

  return (
    <form
      className="field"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSave(name.trim(), type)) setName('');
      }}
    >
      <label htmlFor="area-name">Alan adı</label>
      <input
        id="area-name"
        required
        maxLength={AREA_NAME_MAX_LENGTH}
        value={name}
        placeholder="Örneğin Yeldeğirmeni sokakları"
        onChange={(e) => setName(e.target.value)}
      />
      <fieldset className="types">
        <legend>Tip</legend>
        {ZONE_ORDER.map((t) => (
          <label key={t} className={t === type ? 'type type--on' : 'type'}>
            <input type="radio" name="type" value={t} checked={t === type} onChange={() => setType(t)} />
            <SignIcon type={t} size={24} />
            <span>{ZONES[t].label}</span>
          </label>
        ))}
      </fieldset>
      {error ? <p className="error">{error}</p> : null}
      <div className="row">
        <button type="submit" className="btn btn--primary" disabled={saving || !name.trim()}>
          {saving ? 'Kaydediliyor' : submitLabel}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onDiscard}>
          {discardLabel}
        </button>
      </div>
    </form>
  );
}
