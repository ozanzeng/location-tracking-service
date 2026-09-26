import { useCallback, useEffect, useState } from 'react';
import { useAreas } from '@shared/hooks/useAreas';
import { AreasLayer } from '@shared/map/AreasLayer';
import { BaseMap } from '@shared/map/BaseMap';
import { Legend } from '@shared/zones/Legend';
import { START_POSITION, START_SNAP_METERS } from './config';
import { ConnectionPanel } from './device/ConnectionPanel';
import { DeviceLog } from './device/DeviceLog';
import { useGpsSampler } from './device/useGpsSampler';
import { useOutbox } from './device/useOutbox';
import { endRideBlocker } from './ride/endRideRules';
import { RidePanel } from './ride/RidePanel';
import { CurrentZones } from './rider/CurrentZones';
import { PlateStack } from './rider/PlateStack';
import { RiderMarker } from './rider/RiderMarker';
import { riderZone } from './rider/riderZone';
import { ScooterIdField } from './rider/ScooterIdField';
import { useRiderEvents } from './rider/useRiderEvents';
import { useRiderPosition } from './rider/useRiderPosition';
import { useScooterId } from './rider/useScooterId';
import { MovementPanel, type MoveMode } from './route/MovementPanel';
import { RouteDrawing } from './route/RouteDrawing';
import { RouteLayer } from './route/RouteLayer';
import { useRoadNetwork } from './route/useRoadNetwork';
import { useRoutePlanner } from './route/useRoutePlanner';
import { useRoutePlayback } from './route/useRoutePlayback';

/** Sürücü ekranı: harita + panel. Her parça kendi klasöründe; burası sadece birbirine bağlar. */
export function DriverScreen() {
  const { areas } = useAreas();
  const [scooterId, setScooterId] = useScooterId();
  const [riding, setRiding] = useState(false);
  const [online, setOnline] = useState(true);
  const [rideNotice, setRideNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<MoveMode>('drag');
  const [speedKmh, setSpeedKmh] = useState(25);

  const { position, live, moveTo } = useRiderPosition(START_POSITION);
  const { roads, restrictions, error: roadsError } = useRoadNetwork(areas);
  const planner = useRoutePlanner(roads, restrictions, live);
  const playback = useRoutePlayback(planner.path, speedKmh, moveTo, planner.clear);
  const outbox = useOutbox(online);
  const { plates, dismiss, currentAreas } = useRiderEvents(scooterId);
  useGpsSampler(riding, scooterId, live, outbox.record);

  // Yol ağı yüklenince başlangıç noktasını en yakın yola taşı.
  useEffect(() => {
    const snap = roads?.snap(live.current, START_SNAP_METERS);
    if (snap) moveTo(snap.point);
  }, [roads, live, moveTo]);

  // Scooter hareket edince "burada bitirilemez" uyarısı geçerliliğini yitirir.
  useEffect(() => setRideNotice(null), [position]);

  const toggleRide = () => {
    if (!riding) {
      setRideNotice(null);
      // Sürüş başlarken bağlantı her zaman açılır; önceki sürüşten biriken konumlar da gider.
      setOnline(true);
      setRiding(true);
      return;
    }
    const blocker = endRideBlocker(live.current, areas);
    setRideNotice(blocker);
    if (!blocker) setRiding(false);
  };

  const { clear: clearRoute } = planner;
  const onDragEnd = useCallback(() => {
    moveTo({ ...live.current });
    clearRoute();
  }, [live, moveTo, clearRoute]);

  const drawing = mode === 'route' && !playback.playing && roads !== null;

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
          <RouteLayer path={planner.path} stops={planner.stops} hoveredStop={drawing ? planner.hoveredStop : null} />
          <RiderMarker
            position={position}
            zone={riderZone(riding, currentAreas)}
            draggable={mode === 'drag' && !playback.playing}
            roads={roads}
            restrictions={restrictions}
            live={live}
            onDragEnd={onDragEnd}
          />
        </BaseMap>
        <PlateStack plates={plates} onDismiss={dismiss} />
      </div>

      <aside className="panel">
        <RidePanel riding={riding} notice={rideNotice} onToggle={toggleRide} />
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
        <ConnectionPanel
          riding={riding}
          online={online}
          pending={outbox.pending}
          onToggle={() => setOnline((o) => !o)}
        />
        <DeviceLog entries={outbox.log} />
        <ScooterIdField value={scooterId} onChange={setScooterId} disabled={riding} />
        <Legend />
      </aside>
    </div>
  );
}
