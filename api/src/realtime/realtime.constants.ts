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

export const MONITOR_ROOM = 'monitor';
export const userRoom = (userId: string) => `user:${userId}`;
export const isUserRoom = (room: string) => room.startsWith('user:');
