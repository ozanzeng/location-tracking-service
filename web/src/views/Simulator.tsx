import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Marker, Polyline, useMapEvents } from 'react-leaflet';
import { api, type AreaEvent, type AreaRef, type Position } from '../api';
import { AreasLayer } from '../components/AreasLayer';
import { BaseMap } from '../components/BaseMap';
import { Legend } from '../components/Legend';
import { SignIcon } from '../components/SignIcon';
import { SignPlate, type PlateItem } from '../components/SignPlate';
import { createBots, stepBot, type Bot } from '../sim/bots';
import { distance, pointAlong, type LatLng } from '../sim/geo';
import { getSocket } from '../socket';
import { useAreas } from '../useAreas';
import { dominantZone, ZONES } from '../zones';

const TICK_MS = 500;
const SEND_EVERY_MS = 1000;
const PLATE_MS = 6000;
const START: LatLng = { lat: 40.9878, lng: 29.0292 };

// Tek ikon: rengi değiştirmek için ikonu yenilemek Leaflet'te sürüklemeyi keser,
// bu yüzden bölge bilgisi elemana data-zone olarak yazılır.
const RIDER_ICON = L.divIcon({
  className: 'rider',
  html: '<span></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function RouteClicks({ onAdd }: { onAdd: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onAdd({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export function Simulator() {
  const { areas } = useAreas();
  const [scooterId, setScooterId] = useState(() => `scooter-${Math.floor(100 + Math.random() * 900)}`);
  const [position, setPosition] = useState<LatLng>(START);
  const [mode, setMode] = useState<'drag' | 'route'>('drag');
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [playing, setPlaying] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(25);
  const [plates, setPlates] = useState<PlateItem[]>([]);
  const [currentAreas, setCurrentAreas] = useState<AreaRef[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  // Sürükleme/oynatma sırasında her karede değişen değerler render tetiklemesin.
  const lastSentAt = useRef(0);
  const markerRef = useRef<L.Marker | null>(null);
  const idRef = useRef(scooterId);
  idRef.current = scooterId;

  const send = (point: LatLng) => {
    lastSentAt.current = Date.now();
    api.sendLocation({ userId: idRef.current, lat: point.lat, lng: point.lng }).then(
      () => setSendError(null),
      (err: Error) => setSendError(err.message),
    );
  };

  // Sürücüye özel olaylar: bu scooter'ın room'una abone ol.
  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit('subscribe', { userId: scooterId });
    const onEvent = (event: AreaEvent) => {
      if (event.userId !== scooterId) return;
      const plate: PlateItem = {
        key: `${event.logId}-${event.eventType}`,
        type: event.area.type,
        eventType: event.eventType,
        areaName: event.area.name,
      };
      setPlates((list) => [plate, ...list].slice(0, 3));
      setTimeout(() => setPlates((list) => list.filter((p) => p.key !== plate.key)), PLATE_MS);
    };
    const onPosition = (p: Position) => {
      if (p.userId === scooterId) setCurrentAreas(p.areas);
    };

    join();
    socket.on('connect', join);
    socket.on('area-event', onEvent);
    socket.on('position', onPosition);
    return () => {
      socket.off('connect', join);
      socket.off('area-event', onEvent);
      socket.off('position', onPosition);
      socket.emit('unsubscribe', { userId: scooterId });
    };
  }, [scooterId]);

  // Rotayı oynat: konumu ilerlet, saniyede bir API'ye gönder.
  useEffect(() => {
    if (!playing) return;
    const route = [position, ...waypoints];
    const metersPerTick = (speedKmh / 3.6) * (TICK_MS / 1000);
    let traveled = 0;
    const timer = setInterval(() => {
      traveled += metersPerTick;
      const next = pointAlong(route, traveled) ?? route[route.length - 1];
      const finished = next === route[route.length - 1];
      setPosition(next);
      if (finished || Date.now() - lastSentAt.current >= SEND_EVERY_MS) send(next);
      if (finished) {
        setPlaying(false);
        setWaypoints([]);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
    // Oynatma sırasında rota ve hız kilitli; sadece başlat/durdur tetikler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const routeLine = [position, ...waypoints].map((p) => [p.lat, p.lng] as [number, number]);
  const routeLength = waypoints.length
    ? [position, ...waypoints].reduce((sum, p, i, all) => (i ? sum + distance(all[i - 1], p) : 0), 0)
    : 0;
  const zone = dominantZone(currentAreas.map((a) => a.type));
  // Yeni dizi her render'da konumu sıfırlardı; sadece konum state'i değişince değişsin.
  const markerPosition = useMemo<[number, number]>(() => [position.lat, position.lng], [position]);
  const outsideService = !currentAreas.some((a) => a.type === 'SERVICE' || a.type === 'NO_RIDE');

  useEffect(() => {
    const el = markerRef.current?.getElement();
    if (el) el.dataset.zone = outsideService ? 'NONE' : (zone ?? 'SERVICE');
  }, [zone, outsideService]);

  return (
    <div className="view">
      <div className="map-wrap">
        <BaseMap>
          <AreasLayer areas={areas} />
          {mode === 'route' && !playing ? <RouteClicks onAdd={(p) => setWaypoints((w) => [...w, p])} /> : null}
          {waypoints.length ? (
            <Polyline positions={routeLine} pathOptions={{ color: '#2B2F36', weight: 3, dashArray: '1 8', lineCap: 'round' }} />
          ) : null}
          <Marker
            ref={markerRef}
            position={markerPosition}
            icon={RIDER_ICON}
            draggable={mode === 'drag' && !playing}
            keyboard={false}
            eventHandlers={{
              drag: (e) => {
                const { lat, lng } = (e.target as L.Marker).getLatLng();
                if (Date.now() - lastSentAt.current >= SEND_EVERY_MS) send({ lat, lng });
              },
              dragend: (e) => {
                const { lat, lng } = (e.target as L.Marker).getLatLng();
                setPosition({ lat, lng });
                send({ lat, lng });
              },
            }}
          />
        </BaseMap>
        <div className="plates" aria-live="polite">
          {plates.map((item) => (
            <SignPlate key={item.key} item={item} onClose={() => setPlates((l) => l.filter((p) => p.key !== item.key))} />
          ))}
        </div>
      </div>

      <aside className="panel">
        <header className="panel__head">
          <h1>Simülatör</h1>
          <p>
            Scooter'ı haritada sürükleyin ya da rota çizip oynatın. Bir bölgeye girip çıktığında sürücünün göreceği bildirim
            haritanın üstünde belirir.
          </p>
        </header>

        <section className="field">
          <label htmlFor="scooter-id">Scooter kimliği</label>
          <input
            id="scooter-id"
            value={scooterId}
            maxLength={64}
            disabled={playing}
            onChange={(e) => setScooterId(e.target.value.replace(/[^A-Za-z0-9_.:-]/g, ''))}
          />
        </section>

        <section className="field">
          <span className="field__label" id="mode-label">
            Hareket
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="mode-label">
            {(['drag', 'route'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                disabled={playing}
                onClick={() => setMode(m)}
              >
                {m === 'drag' ? 'Sürükle' : 'Rota çiz'}
              </button>
            ))}
          </div>
          {mode === 'drag' ? (
            <p className="hint">İmleci bırakınca konum gönderilir; sürüklerken saniyede bir.</p>
          ) : (
            <div className="route">
              <p className="hint">
                {waypoints.length
                  ? `${waypoints.length} durak, ${(routeLength / 1000).toFixed(2)} km`
                  : 'Haritaya tıklayarak durak ekleyin.'}
              </p>
              <div className="row">
                <label htmlFor="speed" className="sr-only">
                  Hız
                </label>
                <select id="speed" value={speedKmh} disabled={playing} onChange={(e) => setSpeedKmh(Number(e.target.value))}>
                  <option value={15}>15 km/s</option>
                  <option value={25}>25 km/s</option>
                  <option value={80}>80 km/s (hızlı demo)</option>
                </select>
                <button type="button" className="btn btn--primary" disabled={!waypoints.length && !playing} onClick={() => setPlaying((p) => !p)}>
                  {playing ? 'Durdur' : 'Rotayı oynat'}
                </button>
              </div>
              <button type="button" className="btn btn--quiet" disabled={!waypoints.length || playing} onClick={() => setWaypoints([])}>
                Rotayı temizle
              </button>
            </div>
          )}
        </section>

        <section className="field">
          <span className="field__label">Bulunduğu bölgeler</span>
          {currentAreas.length ? (
            <ul className="zones">
              {currentAreas.map((a) => (
                <li key={a.id}>
                  <SignIcon type={a.type} size={22} />
                  <span>{a.name}</span>
                  <small>{ZONES[a.type].label}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Hiçbir bölgede değil. Kesik çizgili hizmet bölgesinin dışındaysa scooter gri görünür.</p>
          )}
          {sendError ? <p className="error">Konum gönderilemedi: {sendError}</p> : null}
        </section>

        <BotPanel />

        <Legend />
      </aside>
    </div>
  );
}

/** Arka plan trafiği: izleme ekranını ve API'yi doldurmak için rastgele dolaşan scooter'lar. */
function BotPanel() {
  const [count, setCount] = useState(50);
  const [running, setRunning] = useState(false);
  const [sent, setSent] = useState(0);
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    if (!running) return;
    let bots: Bot[] = createBots(count);
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return; // Önceki tur bitmediyse üst üste binme.
      inFlight = true;
      bots = bots.map((b) => stepBot(b, 1));
      const results = await Promise.allSettled(bots.map((b) => api.sendLocation({ userId: b.id, lat: b.lat, lng: b.lng })));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      setSent((n) => n + ok);
      setFailed((n) => n + results.length - ok);
      inFlight = false;
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <section className="field">
      <label htmlFor="bot-count">Arka plan trafiği</label>
      <div className="row">
        <input
          id="bot-count"
          type="number"
          min={1}
          max={300}
          value={count}
          disabled={running}
          onChange={(e) => setCount(Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
        />
        <button type="button" className={running ? 'btn' : 'btn btn--primary'} onClick={() => setRunning((r) => !r)}>
          {running ? 'Botları durdur' : 'Botları başlat'}
        </button>
      </div>
      <p className="hint">
        {sent || failed
          ? `${sent.toLocaleString('tr-TR')} konum gönderildi${failed ? `, ${failed.toLocaleString('tr-TR')} başarısız` : ''}.`
          : 'Her bot saniyede bir konum gönderir. Canlı izleme ekranında hepsini görebilirsiniz.'}
      </p>
    </section>
  );
}
