import type { LogQuery } from '@shared/api/types';
import { LOGS_PAGE_SIZE as PAGE_SIZE } from '../config';
import { LogStatusFilter, type LogFilters } from './logs.types';

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
