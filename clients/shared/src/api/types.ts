import type { Polygon } from 'geojson';

/**
 * API'nin enum'ları. `as const` nesnesi: kullanım enum gibidir (AreaType.PARKING), tip ise
 * API'den JSON ile gelen metin değerleriyle doğrudan uyumludur. Karşılıkları api/src altındaki
 * *.enum.ts dosyalarında; biri değişirse diğeri de değişmeli.
 */
export const AreaType = {
  NO_RIDE: 'NO_RIDE',
  SLOW: 'SLOW',
  NO_PARKING: 'NO_PARKING',
  PARKING: 'PARKING',
  SERVICE: 'SERVICE',
} as const;
export type AreaType = (typeof AreaType)[keyof typeof AreaType];

export const EventType = { ENTER: 'ENTER', EXIT: 'EXIT' } as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

/**
 * Girişin nasıl kapandığı (api/src/logs/exit-reason.enum.ts): alandan çıktı, konumu uzun süre
 * gelmedi (sinyal kesildi), alanın şekli değişti ya da alan silindi.
 */
export const ExitReason = {
  LEFT: 'LEFT',
  SIGNAL_LOST: 'SIGNAL_LOST',
  AREA_CHANGED: 'AREA_CHANGED',
  AREA_REMOVED: 'AREA_REMOVED',
} as const;
export type ExitReason = (typeof ExitReason)[keyof typeof ExitReason];

export const HealthStatus = { OK: 'ok', ERROR: 'error' } as const;
export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

export const DependencyStatus = { UP: 'up', DOWN: 'down' } as const;
export type DependencyStatus = (typeof DependencyStatus)[keyof typeof DependencyStatus];

/** Scooter'ın durumu; aktif kiralamadan hesaplanır (api/src/fleet/scooter-status.enum.ts). */
export const ScooterStatus = { AVAILABLE: 'AVAILABLE', IN_USE: 'IN_USE' } as const;
export type ScooterStatus = (typeof ScooterStatus)[keyof typeof ScooterStatus];

/** Kiralamanın neden bittiği (api/src/fleet/rental-end-reason.enum.ts). */
export const RentalEndReason = { RETURNED: 'RETURNED', SIGNAL_LOST: 'SIGNAL_LOST' } as const;
export type RentalEndReason = (typeof RentalEndReason)[keyof typeof RentalEndReason];

export interface Area {
  id: string;
  name: string;
  type: AreaType;
  geometry: Polygon;
  createdAt: string;
}

export interface AreaRef {
  id: string;
  name: string;
  type: AreaType;
}

export interface AreaEvent {
  logId: string;
  userId: string;
  eventType: EventType;
  area: AreaRef;
  occurredAt: string;
}

export interface Position {
  userId: string;
  lat: number;
  lng: number;
  recordedAt: string;
  areas: AreaRef[];
}

/** GET /locations/latest: son bilinen konum, canlı yayındaki konumla aynı biçimde. */
export type LatestPosition = Position;

/** Bir alan girişi; kullanıcı çıktığında exitTime dolar. */
export interface LogEntry {
  id: string;
  userId: string;
  areaId: string;
  areaName: string;
  areaType: AreaType;
  entryTime: string;
  exitTime: string | null;
  /**
   * Açık girişte null. LEFT: alandan çıktı. SIGNAL_LOST: konumu 30 sn gelmedi, exitTime girişin
   * kapatıldığı an. AREA_CHANGED / AREA_REMOVED: alanın şekli değişti (scooter dışarıda kaldı)
   * ya da alan silindi.
   */
  exitReason: ExitReason | null;
  /** Açık girişte servisin kullanıcıdan son konumu aldığı an; kapanmış girişte null. */
  lastSeenAt: string | null;
}

export interface Scooter {
  id: string;
  name: string;
  status: ScooterStatus;
  /** Son konumun zamanı; hiç göndermediyse null. */
  lastSeenAt: string | null;
  /** Kimde olduğu; sadece operasyon (API anahtarı) görür. */
  rider?: { username: string; since: string } | null;
  /** Sürücünün kendi kiraladığı scooter mı; sadece sürücü oturumunda. */
  mine?: boolean;
}

/** Sunucunun bir konumla ne yaptığı (api/src/fleet/device-log-result.enum.ts). */
export const DeviceLogResult = { PROCESSED: 'PROCESSED', STALE: 'STALE' } as const;
export type DeviceLogResult = (typeof DeviceLogResult)[keyof typeof DeviceLogResult];

/** Sunucu tarafı cihaz günlüğünün bir satırı (worker'ın işlediği konum). */
export interface DeviceLogEntry {
  receivedAt: string;
  processedAt: string;
  recordedAt: string;
  lat: number;
  lng: number;
  result: DeviceLogResult;
  events: Array<{ type: EventType; area: AreaRef }>;
  requestId?: string;
}

/** GET /scooters/:id: operasyonun scooter detayı. */
export interface ScooterDetail {
  id: string;
  /** Filoda kayıtlı ve silinmemiş mi. */
  registered: boolean;
  name: string | null;
  removedAt: string | null;
  status: ScooterStatus | null;
  rider: { username: string; since: string } | null;
  lastLocation: { lat: number; lng: number; recordedAt: string } | null;
  currentAreas: Array<AreaRef & { since: string }>;
  rentals: Array<{ username: string; startedAt: string; endedAt: string | null; endReason: RentalEndReason | null }>;
  deviceLog: DeviceLogEntry[];
}

export interface Rental {
  scooterId: string;
  startedAt: string;
  endedAt: string | null;
  endReason: RentalEndReason | null;
}

export interface Rider {
  id: string;
  username: string;
}

/** POST /auth/login ve /auth/register yanıtı. */
export interface Session {
  token: string;
  expiresIn: number;
  rider: Rider;
}

/** Filo duyurusunun türü (api/src/fleet/fleet-change.enum.ts). */
export const FleetChange = { SCOOTERS: 'scooters', RENTALS: 'rentals' } as const;
export type FleetChange = (typeof FleetChange)[keyof typeof FleetChange];

export interface FleetChanged {
  change: FleetChange;
  scooterId: string;
}

export interface LocationPoint {
  userId: string;
  lat: number;
  lng: number;
  /** Konumun cihazda ölçüldüğü an (ISO 8601). */
  timestamp: string;
}

export interface LogQuery {
  userId?: string;
  areaId?: string;
  active?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface Health {
  status: HealthStatus;
  database: DependencyStatus;
  redis: DependencyStatus;
  queue: { waiting: number; active: number; delayed: number; failed: number } | null;
}
