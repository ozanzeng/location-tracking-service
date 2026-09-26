import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { api, type AreaEvent, type AreaType, type Position } from '../api';
import { AreasLayer } from '../components/AreasLayer';
import { BaseMap } from '../components/BaseMap';
import { Legend } from '../components/Legend';
import { SignIcon } from '../components/SignIcon';
import { getSocket } from '../socket';
import { useAreas } from '../useAreas';
import { scooterColor } from '../zones';

const FEED_LIMIT = 60;
const STALE_MS = 10 * 60_000;

interface Scooter {
  marker: L.CircleMarker;
  types: AreaType[];
  seenAt: number;
}

interface FeedItem {
  key: string;
  userId: string;
  eventType: 'ENTER' | 'EXIT';
  areaName: string;
  areaType: AreaType;
  at: string;
}

type Counts = { total: number } & Partial<Record<AreaType, number>>;

const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Scooter'ları Leaflet katmanında doğrudan günceller: yüzlerce konum saniyede birkaç kez
 * değişirken React state'i kullanmak her seferinde tüm ağacı yeniden render ederdi.
 */
function ScooterLayer({
  scooters,
  onCounts,
}: {
  scooters: React.RefObject<Map<string, Scooter>>;
  onCounts: (c: Counts) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    const all = scooters.current;

    const upsert = (userId: string, lat: number, lng: number, types: AreaType[]) => {
      const color = scooterColor(types);
      const existing = all.get(userId);
      if (existing) {
        existing.marker.setLatLng([lat, lng]).setStyle({ fillColor: color });
        existing.types = types;
        existing.seenAt = Date.now();
        return;
      }
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      })
        .bindTooltip(userId, { direction: 'top', offset: [0, -6] })
        .addTo(layer);
      all.set(userId, { marker, types, seenAt: Date.now() });
    };

    const publishCounts = () => {
      const counts: Counts = { total: all.size };
      for (const s of all.values()) {
        for (const t of new Set(s.types)) counts[t] = (counts[t] ?? 0) + 1;
      }
      onCounts(counts);
    };

    let cancelled = false;
    api.latest().then((list) => {
      if (cancelled) return;
      for (const p of list) upsert(p.userId, p.lat, p.lng, p.areas.map((a) => a.type));
      publishCounts();
    }, () => undefined);

    const socket = getSocket();
    const join = () => socket.emit('subscribe', { monitor: true });
    const onPositions = (batch: Position[]) => {
      for (const p of batch) upsert(p.userId, p.lat, p.lng, p.areas.map((a) => a.type));
    };
    join();
    socket.on('connect', join);
    socket.on('positions', onPositions);

    // Sayaçları konum akışından bağımsız, saniyede bir güncelle; eski scooter'ları temizle.
    const timer = setInterval(() => {
      const cutoff = Date.now() - STALE_MS;
      for (const [id, s] of all) {
        if (s.seenAt < cutoff) {
          s.marker.remove();
          all.delete(id);
        }
      }
      publishCounts();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      socket.off('connect', join);
      socket.off('positions', onPositions);
      socket.emit('unsubscribe', { monitor: true });
      layer.remove();
      all.clear();
    };
  }, [map, scooters, onCounts]);

  return null;
}

function MapHandle({ mapRef }: { mapRef: React.RefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
}

export function Monitor() {
  const { areas } = useAreas();
  const scooters = useRef(new Map<string, Scooter>());
  const mapRef = useRef<L.Map | null>(null);
  const [counts, setCounts] = useState<Counts>({ total: 0 });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [connected, setConnected] = useState(() => getSocket().connected);

  useEffect(() => {
    let cancelled = false;
    api.logs(40).then(({ data }) => {
      if (cancelled) return;
      // Her giriş kaydı bir giriş, çıkış zamanı varsa bir de çıkış olayıdır.
      const history: FeedItem[] = data
        .flatMap((l) => {
          const base = { userId: l.userId, areaName: l.areaName, areaType: l.areaType };
          const enter: FeedItem = { ...base, key: `${l.id}-ENTER`, eventType: 'ENTER', at: l.entryTime };
          return l.exitTime ? [{ ...base, key: `${l.id}-EXIT`, eventType: 'EXIT' as const, at: l.exitTime }, enter] : [enter];
        })
        .toSorted((a, b) => b.at.localeCompare(a.at));
      // Canlı akıştan önce gelen olaylar varsa geçmişle birleştir, tekrarları at.
      setFeed((live) => {
        const seen = new Set(live.map((f) => f.key));
        return [...live, ...history.filter((h) => !seen.has(h.key))].slice(0, FEED_LIMIT);
      });
    }, () => undefined);

    const socket = getSocket();
    const onEvent = (e: AreaEvent) => {
      const item: FeedItem = {
        key: `${e.logId}-${e.eventType}`,
        userId: e.userId,
        eventType: e.eventType,
        areaName: e.area.name,
        areaType: e.area.type,
        at: e.occurredAt,
      };
      setFeed((list) => [item, ...list].slice(0, FEED_LIMIT));
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('area-event', onEvent);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      cancelled = true;
      socket.off('area-event', onEvent);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const focus = (userId: string) => {
    const s = scooters.current.get(userId);
    if (!s || !mapRef.current) return;
    mapRef.current.flyTo(s.marker.getLatLng(), 17, { duration: 0.6 });
    s.marker.openTooltip();
  };

  const outside = counts.total - (counts.SERVICE ?? 0);

  return (
    <div className="view">
      <div className="map-wrap">
        <BaseMap>
          <AreasLayer areas={areas} />
          <ScooterLayer scooters={scooters} onCounts={setCounts} />
          <MapHandle mapRef={mapRef} />
        </BaseMap>
      </div>

      <aside className="panel">
        <header className="panel__head">
          <h1>Canlı izleme</h1>
          <p className={connected ? 'live' : 'live live--off'}>
            {connected ? 'Canlı bağlantı açık' : 'Bağlantı kuruluyor'}
          </p>
        </header>

        <section className="stats" aria-label="Anlık durum">
          <div className="stat">
            <b className="num">{counts.total}</b>
            <span>aktif scooter</span>
          </div>
          <div className="stat stat--alert">
            <b className="num">{counts.NO_RIDE ?? 0}</b>
            <span>sürüş yasak bölgede</span>
          </div>
          <div className="stat">
            <b className="num">{Math.max(0, outside)}</b>
            <span>hizmet bölgesi dışında</span>
          </div>
        </section>

        <Legend counts={counts} />

        <section className="feed">
          <h2>Giriş ve çıkışlar</h2>
          {feed.length ? (
            <ol>
              {feed.map((f) => (
                <li key={f.key} className={`feed__item feed__item--${f.eventType}`}>
                  <SignIcon type={f.areaType} size={24} />
                  <button type="button" onClick={() => focus(f.userId)} title="Haritada göster">
                    <strong>{f.userId}</strong>{' '}
                    {f.eventType === 'ENTER' ? 'girdi:' : 'çıktı:'} {f.areaName}
                  </button>
                  <time dateTime={f.at}>{timeFmt.format(new Date(f.at))}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">
              Henüz olay yok. Simülatörde bir scooter'ı renkli bir bölgeye sürükleyin ya da botları başlatın.
            </p>
          )}
        </section>
        <p className="hint">
          Nokta rengi scooter'ın bulunduğu bölgeyi gösterir: kırmızı sürüş yasak, sarı yavaş, mavi park alanı. Hizmet bölgesi
          dışındakiler gri.
        </p>
      </aside>
    </div>
  );
}

