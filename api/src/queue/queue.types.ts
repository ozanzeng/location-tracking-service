import type { TraceCarrier } from '../common/tracing/tracing.types.js';
import { Redis } from 'ioredis';

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
  /** Dağıtık izleme açıksa isteğin trace bağlamı: worker'daki işlem aynı izde görünür. */
  trace?: TraceCarrier;
}

/** Worker'ın tek bir noktayı işlerken kullandığı biçim. */
export interface UserLocation extends LocationPoint {
  userId: string;
}

/** Şerit düzeni Lua betiği tanımlanmış Redis bağlantısı. */
export type LanesRedis = Redis & {
  laneLayout(key: string, lanes: number): Promise<string>;
};
