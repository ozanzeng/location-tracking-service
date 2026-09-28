import { ExitReason, type LogEntry } from '@shared/api/types';
import { LOGS_NO_SIGNAL_MS } from '../config';
import { VisitStatus } from './logs.types';

export function visitStatus(entry: Pick<LogEntry, 'exitTime' | 'exitReason' | 'lastSeenAt'>, now: number): VisitStatus {
  if (entry.exitTime) {
    switch (entry.exitReason) {
      case ExitReason.SIGNAL_LOST:
        return VisitStatus.SIGNAL_LOST;
      case ExitReason.AREA_CHANGED:
        return VisitStatus.AREA_CHANGED;
      case ExitReason.AREA_REMOVED:
        return VisitStatus.AREA_REMOVED;
      default:
        return VisitStatus.LEFT;
    }
  }
  if (entry.lastSeenAt && now - Date.parse(entry.lastSeenAt) > LOGS_NO_SIGNAL_MS) return VisitStatus.NO_SIGNAL;
  return VisitStatus.INSIDE;
}
