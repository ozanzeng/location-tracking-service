import { useState } from 'react';
import { AreaType } from '@shared/api/types';
import { SignIcon } from '@shared/zones/SignIcon';
import { ZONES, ZONE_ORDER } from '@shared/zones/zoneStyles';

interface Props {
  saving: boolean;
  error: string | null;
  /** Kayıt başarılıysa true döner; form temizlenir. */
  onSave: (name: string, type: AreaType) => Promise<boolean>;
  onDiscard: () => void;
}

/** Çizilen alanın adı ve tipi. */
export function AreaForm({ saving, error, onSave, onDiscard }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AreaType>(AreaType.NO_RIDE);

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
        maxLength={120}
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
          {saving ? 'Kaydediliyor' : 'Alanı kaydet'}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onDiscard}>
          Çizimi sil
        </button>
      </div>
    </form>
  );
}
