import type { LogQuery } from '@shared/api/types';
import { LOGS_PAGE_SIZE as PAGE_SIZE } from '../config';

/** Giriş kayıtlarında "durum" filtresi. */
export const LogStatusFilter = {
  ALL: 'all',
  /** Hâlâ alanın içinde (çıkış zamanı yok). */
  INSIDE: 'inside',
  /** Alandan çıkmış. */
  LEFT: 'left',
} as const;
export type LogStatusFilter = (typeof LogStatusFilter)[keyof typeof LogStatusFilter];

export interface LogFilters {
  userId: string;
  areaId: string;
  status: LogStatusFilter;
  /** datetime-local değeri (yerel saat) */
  from: string;
  to: string;
}

export const EMPTY_FILTERS: LogFilters = { userId: '', areaId: '', status: LogStatusFilter.ALL, from: '', to: '' };

export const isEmpty = (f: LogFilters) =>
  f.userId.trim() === '' && f.areaId === '' && f.status === LogStatusFilter.ALL && f.from === '' && f.to === '';

/** Form değerlerini GET /logs sorgusuna çevirir; boş alanlar gönderilmez, zamanlar UTC'ye çevrilir. */
export function toLogQuery(f: LogFilters): LogQuery {
  return {
    userId: f.userId.trim() || undefined,
    areaId: f.areaId || undefined,
    active: f.status === LogStatusFilter.ALL ? undefined : f.status === LogStatusFilter.INSIDE,
    from: f.from ? new Date(f.from).toISOString() : undefined,
    to: f.to ? new Date(f.to).toISOString() : undefined,
    limit: PAGE_SIZE,
  };
}
