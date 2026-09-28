import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@shared/api/client';
import { useAreas } from '@shared/hooks/useAreas';
import { AreasLayer } from '@shared/map/AreasLayer';
import { BaseMap } from '@shared/map/BaseMap';
import { Legend } from '@shared/zones/Legend';
import { START_POSITION, START_SNAP_METERS } from './config';
import type { LatLng } from './geo/latlng';
import { ConnectionPanel } from './device/ConnectionPanel';
import { DeviceLog } from './device/DeviceLog';
import { useGpsSampler } from './device/useGpsSampler';
import { useOutbox } from './device/useOutbox';
import { endRideBlocker } from './ride/endRideRules';
import { RidePanel } from './ride/RidePanel';
import { useRentalWatch } from './ride/useRentalWatch';
import { CurrentZones } from './rider/CurrentZones';
import { PlateStack } from './rider/PlateStack';
import { RiderMarker } from './rider/RiderMarker';
import { riderZone } from './rider/riderZone';
import { useRiderEvents } from './rider/useRiderEvents';
import { useRiderPosition } from './rider/useRiderPosition';
import { MovementPanel, MoveMode } from './route/MovementPanel';
import { RouteDrawing } from './route/RouteDrawing';
import { RouteLayer } from './route/RouteLayer';
import { useRoadNetwork } from './route/useRoadNetwork';
import { useRoutePlanner } from './route/useRoutePlanner';
import { useRoutePlayback } from './route/useRoutePlayback';

/** Sürüşün nasıl bittiği: sürücü bıraktı ya da sunucu sinyal kaybıyla bitirdi. */
export const RideEnd = { RETURNED: 'returned', LOST: 'lost' } as const;
export type RideEnd = (typeof RideEnd)[keyof typeof RideEnd];

interface Props {
  /** Kiralanan scooter; konumlar onun adına gider. */
  scooterId: string;
  onRideEnded: (end: RideEnd, scooterId: string) => void;
  onSessionExpired: () => void;
}

/** Sürücü ekranı: harita + panel. Her parça kendi klasöründe; burası sadece birbirine bağlar. */
export function DriverScreen({ scooterId, onRideEnded, onSessionExpired }: Props) {
  const { areas } = useAreas();
  const [riding, setRiding] = useState(false);
  /** Scooter bırakılıyor: bekleyen konumlar gönderiliyor, ardından kiralama bitiyor. */
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  // Uyarı verildiği konuma bağlı: scooter hareket edince (yeni konum) geçerliliğini yitirir.
  // Efektle temizlemek oynatmada her adımda fazladan bir çizim demekti.
  const [rideNotice, setRideNotice] = useState<{ text: string; at: LatLng } | null>(null);
  const [mode, setMode] = useState<MoveMode>(MoveMode.DRAG);
  const [speedKmh, setSpeedKmh] = useState(25);

  const { position, live, moveTo } = useRiderPosition(START_POSITION);
  const { roads, restrictions, error: roadsError } = useRoadNetwork(areas);
  const planner = useRoutePlanner(roads, restrictions, live);
  const playback = useRoutePlayback(planner.path, speedKmh, moveTo, planner.clear);
  /**
   * Sürücü scooter'ı bırakırken sunucu kiralamanın bittiğini duyurur; bu, sinyal kaybı sanılıp
   * "kiralama sona erdi" denmesin.
   */
  const releasing = useRef(false);
  const lost = useCallback(() => {
    if (!releasing.current) onRideEnded(RideEnd.LOST, scooterId);
  }, [onRideEnded, scooterId]);
  const checkRental = useRentalWatch(scooterId, lost, onSessionExpired);
  const outbox = useOutbox(online, { onUnauthorized: onSessionExpired, onRentalRejected: checkRental });
  const { plates, dismiss, currentAreas } = useRiderEvents(scooterId);
  const gps = useGpsSampler(riding, scooterId, live, position, areas, outbox.record);

  // Yol ağı yüklenince başlangıç noktasını en yakın yola taşı.
  useEffect(() => {
    const snap = roads?.snap(live.current, START_SNAP_METERS);
    if (snap) moveTo(snap.point);
  }, [roads, live, moveTo]);

  /**
   * Scooter'ı bırakır: önce bekleyen konumlar gönderilir (bağlantı kesikse açılır), sonra
   * kiralama sunucuda biter ve scooter başka sürücülere açılır.
   */
  const release = async () => {
    setEnding(true);
    setEndError(null);
    setOnline(true);
    await outbox.drain();
    releasing.current = true;
    try {
      await api.endRental();
      onRideEnded(RideEnd.RETURNED, scooterId);
    } catch (err) {
      releasing.current = false;
      if (err instanceof ApiError && err.status === 401) return onSessionExpired();
      // 404: kiralama zaten bitmiş (ör. sinyal kaybı).
      if (err instanceof ApiError && err.status === 404) return lost();
      setEndError(`Scooter bırakılamadı: ${(err as Error).message}`);
      setEnding(false);
    }
  };

  const toggleRide = () => {
    if (!riding) {
      setRideNotice(null);
      // Sürüş başlarken bağlantı her zaman açılır; önceki sürüşten biriken konumlar da gider.
      setOnline(true);
      setRiding(true);
      return;
    }
    const blocker = endRideBlocker(live.current, areas);
    setRideNotice(blocker ? { text: blocker, at: position } : null);
    if (!blocker) {
      setRiding(false);
      void release();
    }
  };

  const { clear: clearRoute } = planner;
  const onDragEnd = useCallback(() => {
    moveTo({ ...live.current });
    clearRoute();
  }, [live, moveTo, clearRoute]);

  // Sürüş başlamadan scooter hareket etmez: sürükleme, rota çizme ve oynatma sürüşle açılır.
  const drawing = riding && mode === MoveMode.ROUTE && !playback.playing && roads !== null;
  const notice = rideNotice?.at === position ? rideNotice.text : null;

  return (
    <div className="view">
      <div className={drawing ? 'map-wrap map-wrap--drawing' : 'map-wrap'}>
        <BaseMap>
          <AreasLayer areas={areas} />
          {drawing ? (
            <RouteDrawing
              roads={roads}
              restrictions={restrictions}
              stops={planner.stops}
              onAdd={planner.addStop}
              onRemove={planner.removeStop}
              onHoverStop={planner.setHoveredStop}
            />
          ) : null}
          {riding ? (
            <RouteLayer path={planner.path} stops={planner.stops} hoveredStop={drawing ? planner.hoveredStop : null} />
          ) : null}
          <RiderMarker
            position={position}
            zone={riderZone(riding, currentAreas)}
            draggable={riding && mode === MoveMode.DRAG && !playback.playing}
            roads={roads}
            restrictions={restrictions}
            live={live}
            onDrag={gps.checkBoundary}
            onDragEnd={onDragEnd}
          />
        </BaseMap>
        <PlateStack plates={plates} onDismiss={dismiss} />
      </div>

      <aside className="panel">
        <RidePanel
          scooterId={scooterId}
          riding={riding}
          ending={ending}
          notice={endError ?? notice}
          onToggle={toggleRide}
          onRelease={() => void release()}
        />
        {riding ? (
          <>
            <MovementPanel
              mode={mode}
              onModeChange={setMode}
              playing={playback.playing}
              onTogglePlay={playback.toggle}
              speedKmh={speedKmh}
              onSpeedChange={setSpeedKmh}
              stopCount={planner.stops.length}
              lengthMeters={planner.length}
              roadsReady={roads !== null}
              roadsError={roadsError}
              notice={planner.notice}
              onClear={planner.clear}
            />
            <CurrentZones areas={currentAreas} riding={riding} />
            <ConnectionPanel online={online} pending={outbox.pending} onToggle={() => setOnline((o) => !o)} />
          </>
        ) : (
          <p className="hint">Sürüşü başlatınca scooter'ı haritada sürükleyebilir ya da rota çizip oynatabilirsiniz.</p>
        )}
        <DeviceLog entries={outbox.log} />
        <Legend />
      </aside>
    </div>
  );
}
