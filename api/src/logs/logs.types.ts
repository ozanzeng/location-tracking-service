import type { AreaType } from '../areas/area-type.enum.js';
import type { StoredExitReason } from './exit-reason.enum.js';

/** Keyset sayfalama imlecinin içeriği. */
export interface LogCursor {
  entryTime: string;
  id: string;
}

/** GET /logs sorgusunun satırı (ham SQL). */
export interface LogRow {
  id: string;
  user_id: string;
  area_id: string;
  area_name: string;
  area_type: AreaType;
  entry_time: Date;
  exit_time: Date | null;
  exit_reason: StoredExitReason | null;
  last_seen_at: Date | null;
}

/** Saklama işinin parametreleri. */
export interface RetentionOptions {
  /** Çıkışı bu kadar günden eski kapanmış kayıtlar silinir. */
  days: number;
  batch: number;
  pauseMs: number;
}
