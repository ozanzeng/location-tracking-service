import { useRef, useState } from 'react';
import type L from 'leaflet';
import { useAreas } from '@shared/hooks/useAreas';
import { AreasLayer } from '@shared/map/AreasLayer';
import { BaseMap } from '@shared/map/BaseMap';
import { Legend } from '@shared/zones/Legend';
import { EventFeed } from './EventFeed';
import { LiveStats } from './LiveStats';
import { MapRef } from './MapRef';
import { ScooterLayer, type Counts, type Scooter } from './ScooterLayer';
import { useEventFeed } from './useEventFeed';
import { useSocketConnected } from './useSocketConnected';

/** Canlı izleme: aktif scooter'lar haritada, yanında sayaçlar ve giriş/çıkış akışı. */
export function LiveMap() {
  const { areas } = useAreas();
  const scooters = useRef(new Map<string, Scooter>());
  const mapRef = useRef<L.Map | null>(null);
  const [counts, setCounts] = useState<Counts>({ total: 0 });
  const feed = useEventFeed();
  const connected = useSocketConnected();

  const focus = (userId: string) => {
    const s = scooters.current.get(userId);
    if (!s || !mapRef.current) return;
    mapRef.current.flyTo(s.marker.getLatLng(), 17, { duration: 0.6 });
    s.marker.openTooltip();
  };

  return (
    <div className="view">
      <div className="map-wrap">
        <BaseMap>
          <AreasLayer areas={areas} />
          <ScooterLayer scooters={scooters} onCounts={setCounts} />
          <MapRef mapRef={mapRef} />
        </BaseMap>
      </div>

      <aside className="panel">
        <header className="panel__head">
          <h1>Canlı izleme</h1>
          <p className={connected ? 'live' : 'live live--off'}>
            {connected ? 'Canlı bağlantı açık' : 'Bağlantı kuruluyor'}
          </p>
        </header>
        <LiveStats counts={counts} />
        <Legend counts={counts} />
        <EventFeed feed={feed} onFocus={focus} />
        <p className="hint">
          Son 60 saniyede konum gönderen scooter'lar aktif sayılır; 15 saniyedir sessiz olanlar soluk görünür. Nokta
          rengi bulunduğu bölgeyi gösterir: kırmızı sürüş yasak, sarı yavaş, mavi park alanı. Hizmet bölgesi
          dışındakiler gri.
        </p>
      </aside>
    </div>
  );
}
