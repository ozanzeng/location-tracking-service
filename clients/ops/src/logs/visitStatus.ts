import { ExitReason, type LogEntry } from '@shared/api/types';
import { LOGS_NO_SIGNAL_MS } from '../config';

/** Kayıtlar ekranında bir girişin durumu. */
export const VisitStatus = {
  /** Açık giriş, kullanıcı konum gönderiyor. */
  INSIDE: 'inside',
  /** Açık giriş ama kullanıcıdan bir süredir konum gelmiyor: "içeride" son bilinen durum. */
  NO_SIGNAL: 'no-signal',
  /** Kullanıcı alandan çıktı. */
  LEFT: 'left',
  /** Konumu gelmediği için sunucu kapattı; çıkış zamanı kapatıldığı an. */
  SIGNAL_LOST: 'signal-lost',
} as const;
export type VisitStatus = (typeof VisitStatus)[keyof typeof VisitStatus];

export function visitStatus(entry: Pick<LogEntry, 'exitTime' | 'exitReason' | 'lastSeenAt'>, now: number): VisitStatus {
  if (entry.exitTime) {
    return entry.exitReason === ExitReason.SIGNAL_LOST ? VisitStatus.SIGNAL_LOST : VisitStatus.LEFT;
  }
  if (entry.lastSeenAt && now - Date.parse(entry.lastSeenAt) > LOGS_NO_SIGNAL_MS) return VisitStatus.NO_SIGNAL;
  return VisitStatus.INSIDE;
}
