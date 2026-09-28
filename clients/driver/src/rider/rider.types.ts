import type { AreaType, EventType } from '@shared/api/types';

export interface PlateItem {
  key: string;
  type: AreaType;
  eventType: EventType;
  areaName: string;
}

/** Bölge dışındaki imleç durumları (CSS'te data-zone değeri). */
export const RiderState = {
  /** Sürüş yok: boş halka. */
  IDLE: 'IDLE',
  /** Hizmet bölgesi dışında: gri. */
  NONE: 'NONE',
} as const;

/** Scooter imlecinin rengi: sürüş yoksa boş halka, hizmet bölgesi dışında gri, yoksa en kısıtlayıcı bölge. */
export type RiderZone = AreaType | (typeof RiderState)[keyof typeof RiderState];
