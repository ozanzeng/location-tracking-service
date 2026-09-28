import { DependencyStatus } from './health-status.enum.js';

/** Readiness kontrolünün sonucu. */
export interface Dependencies {
  database: DependencyStatus;
  redis: DependencyStatus;
}
