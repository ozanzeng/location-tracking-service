import type {
  Area,
  AreaType,
  Health,
  LatestPosition,
  LocationPoint,
  LogEntry,
  LogQuery,
  Rental,
  Rider,
  Scooter,
  ScooterDetail,
  Session,
} from './types';
import type { Polygon } from 'geojson';
import { newRequestId } from './requestId';

/** Sunucunun döndüğü hata; istemci Retry-After'a göre bekleyebilsin diye ayrıntılı. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null,
    readonly requestId: string | null,
  ) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Sürücü oturumu: varsa her isteğe Authorization: Bearer olarak eklenir. Operasyon uygulaması
 * kullanmaz; onun anahtarını nginx ekler.
 */
let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<{ body: T; requestId: string | null }> {
  // Her isteğe kimlik: sunucu ve worker loglarında bu istek izlenebilir.
  const requestId = newRequestId();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-request-id': requestId,
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı', 0, null, requestId);
  }
  const echoed = res.headers.get('x-request-id');
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? `İstek başarısız (${res.status})`);
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new ApiError(message, res.status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null, echoed);
  }
  // 204 (çıkış, silme): gövde yok.
  const body = res.status === 204 ? undefined : await res.json();
  return { body: body as T, requestId: echoed };
}

const get = async <T>(path: string) => (await request<T>(path)).body;
const post = async <T>(path: string, body?: object) =>
  (await request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })).body;

const toQuery = (params: object) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const api = {
  areas: () => get<Area[]>('/areas'),
  createArea: async (body: { name: string; type: AreaType; geometry: Polygon }) =>
    (await request<Area>('/areas', { method: 'POST', body: JSON.stringify(body) })).body,
  updateArea: async (id: string, body: { name?: string; type?: AreaType; geometry?: Polygon }) =>
    (await request<Area>(`/areas/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) })).body,
  deleteArea: async (id: string) => {
    await request<void>(`/areas/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  /** Tek konum POST /locations, birden fazlası POST /locations/batch ile gider. */
  sendLocations: async (points: LocationPoint[]) => {
    const { requestId } =
      points.length === 1
        ? await request('/locations', { method: 'POST', body: JSON.stringify(points[0]) })
        : await request('/locations/batch', { method: 'POST', body: JSON.stringify({ locations: points }) });
    return { requestId };
  },
  latest: (sinceMinutes = 1) => get<LatestPosition[]>(`/locations/latest?sinceMinutes=${sinceMinutes}`),
  logs: (query: LogQuery = {}) => get<{ data: LogEntry[]; nextCursor: string | null }>(`/logs${toQuery(query)}`),
  health: () => get<Health>('/health'),

  // Sürücü hesabı
  register: (username: string, password: string) => post<Session>('/auth/register', { username, password }),
  login: (username: string, password: string) => post<Session>('/auth/login', { username, password }),
  logout: () => post<void>('/auth/logout'),
  me: () => get<Rider>('/auth/me'),

  // Filo ve kiralama
  scooters: () => get<Scooter[]>('/scooters'),
  scooterDetail: (id: string) => get<ScooterDetail>(`/scooters/${encodeURIComponent(id)}`),
  createScooter: (body: { id: string; name?: string }) => post<Scooter>('/scooters', body),
  deleteScooter: async (id: string) => {
    await request<void>(`/scooters/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  rent: (scooterId: string) => post<Rental>('/rentals', { scooterId }),
  currentRental: async () => (await get<{ rental: Rental | null }>('/rentals/current')).rental,
  endRental: () => post<Rental>('/rentals/current/end'),
};
