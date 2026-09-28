import { LogStatusFilter, type LogFilters } from './logs.types';

/** Filtresiz kayıt listesi. */
export const EMPTY_FILTERS: LogFilters = { userId: '', areaId: '', status: LogStatusFilter.ALL, from: '', to: '' };
