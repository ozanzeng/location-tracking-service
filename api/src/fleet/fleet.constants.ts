import type { FleetChange } from './fleet-change.enum.js';

/** Filo değişikliklerinin duyurulduğu kanal; önek ortamları ayırır. */
export const fleetChannel = (prefix: string) => `${prefix}:fleet`;

export interface FleetChangedMessage {
  change: FleetChange;
  scooterId: string;
}
