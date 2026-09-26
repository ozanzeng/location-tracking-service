import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Polygon as GeoPolygon } from 'geojson';
import { useMap } from 'react-leaflet';
import { api, type AreaType } from '../api';
import { AreasLayer } from '../components/AreasLayer';
import { BaseMap } from '../components/BaseMap';
import { SignIcon } from '../components/SignIcon';
import { useAreas } from '../useAreas';
import { ZONES, ZONE_ORDER } from '../zones';

interface Draft {
  layer: L.Layer;
  geometry: GeoPolygon;
}

/**
 * Çizim aracı (leaflet-geoman) sadece bu ekranda gerekli; ana pakete girmesin diye
 * ekran açıldığında yüklenir.
 */
function DrawControl({ onDraw, drafting }: { onDraw: (d: Draft) => void; drafting: boolean }) {
  const map = useMap();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([import('@geoman-io/leaflet-geoman-free'), import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css')]).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Geoman sadece kendisinden sonra oluşturulan haritalara bağlanır; harita önceden
    // oluştuğu için bu haritaya elle bağla.
    if (!map.pm) {
      const PM = (L as unknown as { PM: { Map: new (m: L.Map) => L.PM.PMMap } }).PM;
      map.pm = new PM.Map(map);
    }
    map.pm.setLang('tr');
    map.pm.addControls({
      position: 'topleft',
      drawPolygon: true,
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: true,
      drawCircle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
      editMode: true,
      dragMode: false,
      removalMode: false,
    });
    map.pm.setGlobalOptions({ allowSelfIntersection: false, pathOptions: { color: '#1F5FAD', weight: 2 } });

    const onCreate = (e: { layer: L.Layer }) => {
      const layer = e.layer as L.Polygon;
      onDraw({ layer, geometry: layer.toGeoJSON().geometry as GeoPolygon });
      // Düzenleme sonrası geometriyi güncel tut.
      layer.on('pm:edit', () => onDraw({ layer, geometry: layer.toGeoJSON().geometry as GeoPolygon }));
    };
    map.on('pm:create', onCreate);
    return () => {
      map.off('pm:create', onCreate);
      map.pm.removeControls();
    };
  }, [ready, map, onDraw]);

  // Taslak varken ikinci bir çizime izin verme.
  useEffect(() => {
    if (!ready) return;
    map.pm.Toolbar.setButtonDisabled('drawPolygon', drafting);
    map.pm.Toolbar.setButtonDisabled('drawRectangle', drafting);
  }, [ready, drafting, map]);

  return null;
}

export function AreasEditor() {
  const { areas, reload, error: loadError } = useAreas();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AreaType>('NO_RIDE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const setDraftRef = useRef((d: Draft) => {
    setDraft(d);
    setSaved(null);
  });

  const discard = () => {
    draft?.layer.remove();
    setDraft(null);
    setError(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const area = await api.createArea({ name: name.trim(), type, geometry: draft.geometry });
      draft.layer.remove();
      setDraft(null);
      setName('');
      setSaved(`${area.name} kaydedildi.`);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view">
      <div className="map-wrap">
        <BaseMap>
          <AreasLayer areas={areas} />
          <DrawControl onDraw={setDraftRef.current} drafting={Boolean(draft)} />
        </BaseMap>
      </div>

      <aside className="panel">
        <header className="panel__head">
          <h1>Alanlar</h1>
          <p>Sol üstteki çokgen veya dikdörtgen aracıyla haritaya yeni bir bölge çizin, sonra adını ve tipini seçip kaydedin.</p>
        </header>

        {draft ? (
          <form className="field" onSubmit={save}>
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
              <button type="button" className="btn btn--quiet" onClick={discard}>
                Çizimi sil
              </button>
            </div>
          </form>
        ) : (
          <p className="hint">{saved ?? 'Kaydedilmemiş çizim yok.'}</p>
        )}

        <section className="field">
          <h2>Tanımlı alanlar ({areas.length})</h2>
          {loadError ? <p className="error">Alanlar yüklenemedi: {loadError}</p> : null}
          <ul className="zones">
            {areas.map((a) => (
              <li key={a.id}>
                <SignIcon type={a.type} size={22} />
                <span>{a.name}</span>
                <small>{ZONES[a.type].label}</small>
              </li>
            ))}
          </ul>
          {!areas.length && !loadError ? <p className="hint">Henüz alan yok. İlk alanı haritaya çizerek ekleyin.</p> : null}
        </section>
      </aside>
    </div>
  );
}
