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

/** İşlemeye başlamadan önceki durum. */
export interface GeofenceState {
  /** Kullanıcının en son işlenen konumunun zamanı. */
  lastRecordedAt: Date | null;
  /** Yeni konumu içeren alanlar. */
  inside: AreaRef[];
  /** Açık girişi olan (şu an içinde bulunulan) alanlar. */
  present: AreaRef[];
}

/** Bir konumun ürettiği giriş ya da çıkış. */
export interface Transition {
  logId: string;
  areaId: string;
  eventType: AreaEventType;
}

/** Önceki ve yeni alanlar arasındaki fark. */
export interface PresenceDiff {
  entered: string[];
  exited: string[];
}
