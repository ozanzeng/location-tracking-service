import type { LogQuery } from '@shared/api/types';

export const PAGE_SIZE = 50;

export interface LogFilters {
  userId: string;
  areaId: string;
  status: 'all' | 'inside' | 'left';
  /** datetime-local değeri (yerel saat) */
  from: string;
  to: string;
}

export const EMPTY_FILTERS: LogFilters = { userId: '', areaId: '', status: 'all', from: '', to: '' };

export const isEmpty = (f: LogFilters) =>
  f.userId.trim() === '' && f.areaId === '' && f.status === 'all' && f.from === '' && f.to === '';

/** Form değerlerini GET /logs sorgusuna çevirir; boş alanlar gönderilmez, zamanlar UTC'ye çevrilir. */
export function toLogQuery(f: LogFilters): LogQuery {
  return {
    userId: f.userId.trim() || undefined,
    areaId: f.areaId || undefined,
    active: f.status === 'all' ? undefined : f.status === 'inside',
    from: f.from ? new Date(f.from).toISOString() : undefined,
    to: f.to ? new Date(f.to).toISOString() : undefined,
    limit: PAGE_SIZE,
  };
}
