import type { AreaEvent, PositionUpdate } from '../geofence/geofence.types.js';

/** Worker'lardan API instance'larına işlenmiş konum yayını. */
export const GEOFENCE_UPDATES_CHANNEL = 'geofence:updates';

export interface GeofenceUpdateMessage {
  position: PositionUpdate;
  events: AreaEvent[];
}

export const MONITOR_ROOM = 'monitor';
export const userRoom = (userId: string) => `user:${userId}`;
