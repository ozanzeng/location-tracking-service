import { useCallback, useState } from 'react';
import { api } from '@shared/api/client';
import type { AreaType } from '@shared/api/types';
import { useAreas } from '@shared/hooks/useAreas';
import { AreasLayer } from '@shared/map/AreasLayer';
import { BaseMap } from '@shared/map/BaseMap';
import { AreaForm } from './AreaForm';
import { AreaList } from './AreaList';
import { DrawControl, type Draft } from './DrawControl';

/** Alan yönetimi: haritaya çiz, adını ve tipini seç, POST /areas ile kaydet. */
export function AreasEditor() {
  const { areas, reload, error: loadError } = useAreas();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const onDraw = useCallback((d: Draft) => {
    setDraft(d);
    setSaved(null);
  }, []);

  const discard = () => {
    draft?.layer.remove();
    setDraft(null);
    setError(null);
  };

  const save = async (name: string, type: AreaType): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    setError(null);
    try {
      const area = await api.createArea({ name, type, geometry: draft.geometry });
      draft.layer.remove();
      setDraft(null);
      setSaved(`${area.name} kaydedildi.`);
      // Kimlik verilir: o sırada süren bir liste isteği kayıttan önce başlamışsa yeniden istenir.
      reload(area.id);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view">
      <div className="map-wrap">
        <BaseMap>
          <AreasLayer areas={areas} />
          <DrawControl onDraw={onDraw} drafting={Boolean(draft)} />
        </BaseMap>
      </div>

      <aside className="panel">
        <header className="panel__head">
          <h1>Alanlar</h1>
          <p>
            Sol üstteki çokgen veya dikdörtgen aracıyla haritaya yeni bir bölge çizin, sonra adını ve tipini seçip
            kaydedin.
          </p>
        </header>
        {draft ? (
          <AreaForm saving={saving} error={error} onSave={save} onDiscard={discard} />
        ) : (
          <p className="hint">{saved ?? 'Kaydedilmemiş çizim yok.'}</p>
        )}
        <AreaList areas={areas} error={loadError} />
      </aside>
    </div>
  );
}
