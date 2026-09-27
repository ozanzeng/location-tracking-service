/**
 * Şeritlerden önceki tek kuyruk. Redis AOF ile kalıcı olduğu için güncelleme sırasında
 * içinde iş kalmış olabilir; worker'lar onu da (şerit gibi, tek tek) işler.
 */
export const LEGACY_LOCATION_QUEUE = 'locations';
export const LOCATION_JOB = 'location';

export interface LocationPoint {
  lat: number;
  lng: number;
  /** Konumun cihazda ölçüldüğü an (ISO 8601). */
  recordedAt: string;
}

/**
 * Bir kullanıcının bir istekte gönderdiği konumlar. Toplu istekteki noktalar tek işte,
 * zamana göre sıralı tutulur. Aynı kullanıcının ayrı istekleri ise hep aynı şeride düşer
 * ve şeritte işler tek tek, geliş sırasıyla işlenir (bkz. LocationLanes).
 */
export interface LocationJobData {
  userId: string;
  points: LocationPoint[];
  /** İsteği worker loglarında izleyebilmek için API'deki istek kimliği. */
  requestId?: string;
}

/** Worker'ın tek bir noktayı işlerken kullandığı biçim. */
export interface UserLocation extends LocationPoint {
  userId: string;
}
