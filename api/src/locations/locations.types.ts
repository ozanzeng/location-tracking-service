import type { AreaRef } from '../geofence/geofence.types.js';

/** GET /locations/latest satırı: son konum ve içinde bulunulan alanlar. */
export interface LatestPosition {
  userId: string;
  lat: number;
  lng: number;
  recordedAt: string;
  /** Kullanıcının şu an içinde bulunduğu alanlar (açık girişler). */
  areas: AreaRef[];
}

/** İstekten gelen, henüz doğrulanmamış konum. */
export interface IncomingLocation {
  userId: string;
  lat: number;
  lng: number;
  timestamp: string;
}
