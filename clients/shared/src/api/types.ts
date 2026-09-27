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

export const HealthStatus = { OK: 'ok', ERROR: 'error' } as const;
export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

export const DependencyStatus = { UP: 'up', DOWN: 'down' } as const;
export type DependencyStatus = (typeof DependencyStatus)[keyof typeof DependencyStatus];

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
