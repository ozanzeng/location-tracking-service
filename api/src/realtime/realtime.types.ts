import type {
  AreaEvent,
  AreaRef,
  PositionUpdate,
} from '../geofence/geofence.types.js';
import type { Principal } from '../security/security.types.js';

/** Alan listesi değişti; istemciler listeyi yeniden çeker. */
export interface AreasChangedMessage {
  created?: AreaRef;
  updated?: AreaRef;
  deleted?: { id: string };
}

/**
 * İşlenmiş konum ve giriş/çıkış olayları (worker). Alan düzenlenince ya da silinince kapanan
 * girişler konumsuz yayınlanır (API).
 */
export interface GeofenceUpdateMessage {
  position?: PositionUpdate;
  events: AreaEvent[];
}

/** İstemcinin abonelik mesajı. */
export interface SubscribePayload {
  monitor?: boolean;
  events?: boolean;
  userId?: string;
}

/** Socket.IO bağlantısına eklenen veri. */
export interface ClientData {
  /** El sıkışmadaki kimlik doğrulaması; mesajlar bunu bekler (bağlantı anında gelebilirler). */
  auth?: Promise<Principal | null>;
}

/** Redis mesajı dinleyicisi. */
export type Handler<T> = (message: T) => void;

/** Canlı yayın bağlantısının ping ayarları. */
export interface HeartbeatOptions {
  /** Sunucunun ping gönderme aralığı (ms). */
  pingInterval: number;
  /** Ping'e bu süre içinde cevap vermeyen bağlantı kapatılır (ms). */
  pingTimeout: number;
}
