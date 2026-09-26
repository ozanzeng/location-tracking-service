import type { PositionUpdate } from '../geofence/geofence.types.js';

/**
 * Canlı konumlar yük altında istemcileri boğmasın diye kullanıcı başına sadece son konum
 * tutulur; gateway belirli aralıklarla hepsini tek seferde gönderir.
 */
export class PositionBuffer {
  private pending = new Map<string, PositionUpdate>();

  add(position: PositionUpdate): void {
    this.pending.set(position.userId, position);
  }

  /** Biriken konumları verir ve tamponu boşaltır. */
  drain(): PositionUpdate[] {
    if (this.pending.size === 0) return [];
    const batch = [...this.pending.values()];
    this.pending = new Map();
    return batch;
  }
}
