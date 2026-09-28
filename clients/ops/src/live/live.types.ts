import { type AreaType, EventType } from '@shared/api/types';

/** Canlı haritadaki scooter. */
export interface Scooter {
  marker: L.CircleMarker;
  types: AreaType[];
  /** Son görülme (canlı konumda geliş anı, açılış yüklemesinde ölçüm anı). */
  seenAt: number;
  /** Gösterilen konumun cihazda ölçüldüğü an: eski konum yenisini ezmesin. */
  recordedAt: number;
  /** Soluk çizildi mi: her saniye yeniden boyanmasın. */
  faded: boolean;
}

/** Olay akışının bir satırı. */
export interface FeedItem {
  key: string;
  userId: string;
  eventType: EventType;
  areaName: string;
  areaType: AreaType;
  at: string;
}

/** Canlı sayaçlar: toplam, hizmet bölgesi dışı ve bölge tipine göre. */
export type Counts = { total: number; outside: number } & Partial<Record<AreaType, number>>;

/** Scooter'ın son görülmesinden bu yana geçen süreye göre durumu. */
export type Silence = 'active' | 'idle' | 'gone';
