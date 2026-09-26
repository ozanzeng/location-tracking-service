import type { OrderWait } from './job-order.js';

export const LOCATION_QUEUE = 'locations';
export const LOCATION_JOB = 'location';

export interface LocationPoint {
  lat: number;
  lng: number;
  /** Konumun cihazda ölçüldüğü an (ISO 8601). */
  recordedAt: string;
}

/**
 * Bir kullanıcının bir istekte gönderdiği konumlar. Toplu istekteki noktalar tek işte,
 * zamana göre sıralı tutulur: ayrı işler olsalardı paralel worker'lar yeniyi eskiden önce
 * işleyebilir, eski nokta "geç gelmiş" sayılıp atlanır ve alan girişi kaçabilirdi.
 * Aynı kullanıcının ayrı istekleri arasındaki sıra `seq` ile korunur (UserSequencer).
 */
export interface LocationJobData {
  userId: string;
  points: LocationPoint[];
  /** İsteği worker loglarında izleyebilmek için API'deki istek kimliği. */
  requestId?: string;
  /** Kullanıcı başına iş sırası; worker önceki iş bitmeden bunu işlemez. */
  seq?: number;
  /** Sırası gelmeyen işin bekleme durumu (worker yazar). */
  orderWait?: OrderWait;
}

/** Worker'ın tek bir noktayı işlerken kullandığı biçim. */
export interface UserLocation extends LocationPoint {
  userId: string;
}
