import type { AreaEventType } from '../geofence/area-event-type.enum.js';
import type { AreaRef } from '../geofence/geofence.types.js';
import type { DeviceLogResult } from './device-log-result.enum.js';
import type { FleetChange } from './fleet-change.enum.js';
import type { RentalEndReason } from './rental-end-reason.enum.js';

/** Cihaz günlüğünün bir satırı: sunucunun bir konumla ne yaptığı. */
export interface DeviceLogEntry {
  /** API'nin konumu kabul edip kuyruğa aldığı an. */
  receivedAt: string;
  /** Worker'ın konumu işlediği an. */
  processedAt: string;
  /** Konumun cihazda ölçüldüğü an (gönderilen timestamp). */
  recordedAt: string;
  lat: number;
  lng: number;
  result: DeviceLogResult;
  /** Bu konumla girilen ya da çıkılan alanlar. */
  events: Array<{ type: AreaEventType; area: AreaRef }>;
  /** İsteğin kimliği; API ve worker loglarında aynı istek bununla bulunur. */
  requestId?: string;
}

/** Filo değişikliği duyurusu (Redis <önek>:fleet kanalı). */
export interface FleetChangedMessage {
  change: FleetChange;
  scooterId: string;
}

/** rentals satırı (ham SQL). */
export interface RentalRow {
  scooter_id: string;
  started_at: Date;
  ended_at: Date | null;
  end_reason: RentalEndReason | null;
}

/** Sürüşün bittiği konum. */
export interface RentalEndPoint {
  lat: number;
  lng: number;
}

/** Bitiş noktasının alanlara göre durumu (tek sorguda). */
export interface EndSpot {
  in_parking: boolean;
  in_no_parking: boolean;
  nearest_parking: string | null;
  nearest_meters: number | null;
}

/** Filo listesi satırı: scooter, varsa aktif kiralaması ve son sinyali (ham SQL). */
export interface ScooterRow {
  id: string;
  name: string;
  rider_id: string | null;
  username: string | null;
  rented_since: Date | null;
  last_seen_at: Date | null;
}
