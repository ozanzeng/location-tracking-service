import { useCallback, useMemo, useState } from 'react';
import type { Polygon as GeoPolygon } from 'geojson';
import { api } from '@shared/api/client';
import type { Area, AreaType } from '@shared/api/types';
import { useAreas } from '@shared/hooks/useAreas';
import { AreasLayer } from '@shared/map/AreasLayer';
import { BaseMap } from '@shared/map/BaseMap';
import { AreaForm } from './AreaForm';
import { AreaList } from './AreaList';
import { DrawControl, type Draft } from './DrawControl';
import { EditShape } from './EditShape';

/**
 * Alan yönetimi:
 * - Yeni alan: haritaya çiz, adını ve tipini seç, POST /areas ile kaydet.
 * - Düzenleme: listeden seç; ad ve tip formda, şekil haritada köşeleri sürükleyerek değişir,
 *   PATCH /areas/:id ile kaydedilir.
 * - Silme: listeden, sayfa içinde onayla; DELETE /areas/:id.
 * Aynı anda tek iş: taslak varken düzenleme, düzenleme varken yeni çizim açılmaz.
 */
export function AreasEditor() {
  const { areas, reload, error: loadError } = useAreas();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Area | null>(null);
  /** Düzenlemede değiştirilmiş şekil; değişmediyse null (sunucuya gönderilmez). */
  const [shape, setShape] = useState<GeoPolygon | null>(null);
  const [drawReady, setDrawReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onDraw = useCallback((d: Draft) => {
    setDraft(d);
    setNotice(null);
  }, []);
  const onDrawReady = useCallback(() => setDrawReady(true), []);

  const discardDraft = () => {
    draft?.layer.remove();
    setDraft(null);
    setError(null);
  };

  const startEdit = (area: Area) => {
    setEditing(area);
    setShape(null);
    setError(null);
    setNotice(null);
  };
  const stopEdit = () => {
    setEditing(null);
    setShape(null);
    setError(null);
  };

  const create = async (name: string, type: AreaType): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    setError(null);
    try {
      const area = await api.createArea({ name, type, geometry: draft.geometry });
      draft.layer.remove();
      setDraft(null);
      setNotice(`${area.name} kaydedildi.`);
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

  const update = async (name: string, type: AreaType): Promise<boolean> => {
    if (!editing) return false;
    setSaving(true);
    setError(null);
    try {
      const area = await api.updateArea(editing.id, {
        name,
        type,
        ...(shape ? { geometry: shape } : {}),
      });
      setNotice(
        shape
          ? `${area.name} güncellendi. Yeni şeklin dışında kalan scooterların girişleri kapatıldı.`
          : `${area.name} güncellendi.`,
      );
      stopEdit();
      reload();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async (area: Area) => {
    setError(null);
    setNotice(null);
    try {
      await api.deleteArea(area.id);
      setNotice(`${area.name} silindi. İçindeki scooterların girişleri kapatıldı; geçmiş kayıtlar duruyor.`);
      reload();
    } catch (err) {
      setError(`${area.name} silinemedi: ${(err as Error).message}`);
    }
  };

  // Düzenlenen alan haritada düzenleme katmanıyla çizilir; kayıtlı hali gizlenir.
  const shown = useMemo(() => (editing ? areas.filter((a) => a.id !== editing.id) : areas), [areas, editing]);

  return (
    <div className="view">
      <div className="map-wrap">
        <BaseMap>
          <AreasLayer areas={shown} />
          <DrawControl onDraw={onDraw} drafting={Boolean(draft || editing)} onReady={onDrawReady} />
          {editing ? <EditShape area={editing} ready={drawReady} onChange={setShape} /> : null}
        </BaseMap>
      </div>

      <aside className="panel">
        <header className="panel__head">
          <h1>{editing ? 'Alanı düzenle' : 'Alanlar'}</h1>
          <p>
            {editing
              ? 'Adı ve tipi değiştirin; şekli değiştirmek için haritada köşeleri sürükleyin (kenar ortasındaki noktadan yeni köşe eklenir).'
              : 'Sol üstteki çokgen veya dikdörtgen aracıyla haritaya yeni bir bölge çizin, sonra adını ve tipini seçip kaydedin. Kayıtlı alanlar listeden düzenlenir ya da silinir.'}
          </p>
        </header>
        {editing ? (
          <>
            <AreaForm
              key={editing.id}
              saving={saving}
              error={error}
              initial={{ name: editing.name, type: editing.type }}
              submitLabel="Değişiklikleri kaydet"
              discardLabel="Vazgeç"
              onSave={update}
              onDiscard={stopEdit}
            />
            <p className="hint">
              {shape
                ? 'Şekil değişti. Kaydedince son konumu yeni şeklin dışında kalan scooterların girişleri kapanır.'
                : 'Şekil değişmedi.'}
            </p>
          </>
        ) : draft ? (
          <AreaForm
            saving={saving}
            error={error}
            submitLabel="Alanı kaydet"
            discardLabel="Çizimi sil"
            onSave={create}
            onDiscard={discardDraft}
          />
        ) : (
          <>
            {error ? <p className="error">{error}</p> : null}
            <p className="hint">{notice ?? 'Kaydedilmemiş çizim yok.'}</p>
          </>
        )}
        <AreaList
          areas={areas}
          error={loadError}
          editingId={editing?.id ?? null}
          busy={saving || Boolean(draft || editing)}
          onEdit={startEdit}
          onDelete={(a) => void remove(a)}
        />
      </aside>
    </div>
  );
}
