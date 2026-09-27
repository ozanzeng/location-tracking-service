import type { AreaType } from '../areas/area-type.enum.js';
import type { AreaEventType } from './area-event-type.enum.js';
import type { ProcessStatus } from './process-status.enum.js';

export interface AreaRef {
  id: string;
  name: string;
  type: AreaType;
}

export interface AreaEvent {
  /** Ziyaret kaydının id'si; giriş ve çıkış olayları aynı id'yi paylaşır. */
  logId: string;
  userId: string;
  eventType: AreaEventType;
  area: AreaRef;
  occurredAt: string;
}

export interface PositionUpdate {
  userId: string;
  lat: number;
  lng: number;
  recordedAt: string;
  /** Konumun şu an içinde olduğu alanlar. */
  areas: AreaRef[];
}

export type ProcessResult =
  | { status: ProcessStatus.STALE }
  | {
      status: ProcessStatus.PROCESSED;
      events: AreaEvent[];
      position: PositionUpdate;
    };
