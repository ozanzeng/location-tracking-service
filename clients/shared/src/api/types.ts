import type { Polygon } from 'geojson';

export type AreaType = 'NO_RIDE' | 'SLOW' | 'NO_PARKING' | 'PARKING' | 'SERVICE';
export type EventType = 'ENTER' | 'EXIT';

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
  status: 'ok' | 'error';
  database: 'up' | 'down';
  redis: 'up' | 'down';
  queue: { waiting: number; active: number; delayed: number; failed: number } | null;
}
