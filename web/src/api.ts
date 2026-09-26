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

export interface LatestPosition {
  userId: string;
  lat: number;
  lng: number;
  recordedAt: string;
  areas: AreaRef[];
}

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

const BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? `İstek başarısız (${res.status})`);
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  areas: () => request<Area[]>('/areas'),
  createArea: (body: { name: string; type: AreaType; geometry: Polygon }) =>
    request<Area>('/areas', { method: 'POST', body: JSON.stringify(body) }),
  sendLocation: (body: { userId: string; lat: number; lng: number }) =>
    request<{ jobId: string }>('/locations', {
      method: 'POST',
      // Gerçek cihaz gibi konumun ölçüldüğü anı gönder.
      body: JSON.stringify({ ...body, timestamp: new Date().toISOString() }),
    }),
  latest: () => request<LatestPosition[]>('/locations/latest?sinceMinutes=30'),
  logs: (limit = 40) => request<{ data: LogEntry[] }>(`/logs?limit=${limit}`),
};
