import { type FormEvent, useState } from 'react';
import { SCOOTER_ID_MAX_LENGTH, SCOOTER_ID_PATTERN as ID_PATTERN, SCOOTER_NAME_MAX_LENGTH } from '@shared/api/limits';

interface Props {
  /** Başarılıysa true; form temizlenir. */
  onAdd: (id: string, name: string) => Promise<boolean>;
  saving: boolean;
}

/** Filoya scooter ekleme. Aynı kimlikle silinmiş bir scooter varsa geri gelir. */
export function ScooterForm({ onAdd, saving }: Props) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const validId = ID_PATTERN.test(id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await onAdd(id.trim(), name.trim())) {
      setId('');
      setName('');
    }
  };

  return (
    <form className="filters" onSubmit={submit}>
      <label>
        Kimlik
        <input
          id="scooter-new-id"
          required
          maxLength={SCOOTER_ID_MAX_LENGTH}
          value={id}
          placeholder="scooter-06"
          spellCheck={false}
          onChange={(e) => setId(e.target.value.trim())}
        />
      </label>
      <label>
        Ad (isteğe bağlı)
        <input
          id="scooter-new-name"
          maxLength={SCOOTER_NAME_MAX_LENGTH}
          value={name}
          placeholder="Scooter 06"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="filters__actions">
        <button type="submit" className="btn btn--primary" disabled={saving || !validId}>
          {saving ? 'Ekleniyor' : 'Scooter ekle'}
        </button>
      </div>
      {id && !validId ? <p className="error">Kimlik sadece harf, rakam ve _ . : - içerebilir.</p> : null}
    </form>
  );
}
