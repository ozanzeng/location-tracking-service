import type {
  AreaEvent,
  AreaRef,
  PositionUpdate,
} from '../geofence/geofence.types.js';

/** Worker'lardan API instance'larına işlenmiş konum yayını; önek ortamları ayırır. */
export const updatesChannel = (prefix: string) => `${prefix}:updates`;

/** Alan listesi değişince (yeni alan) tüm istemcilere duyuru. */
export const areasChannel = (prefix: string) => `${prefix}:areas`;

export interface AreasChangedMessage {
  created: AreaRef;
}

export interface GeofenceUpdateMessage {
  position: PositionUpdate;
  events: AreaEvent[];
}

/** Tüm filo: konumlar ve alan olayları (canlı harita). */
export const MONITOR_ROOM = 'monitor';
/** Tüm filonun yalnızca alan olayları (kayıtlar ekranı); konum yayını almaz. */
export const EVENTS_ROOM = 'events';
export const userRoom = (userId: string) => `user:${userId}`;
export const isUserRoom = (room: string) => room.startsWith('user:');
