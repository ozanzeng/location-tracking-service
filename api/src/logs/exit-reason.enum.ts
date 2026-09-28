/** Girişin nasıl kapandığı (GET /logs → exitReason; açık girişte null). */
export enum ExitReason {
  /** Kullanıcının alan dışındaki konumu geldi. */
  LEFT = 'LEFT',
  /**
   * Kullanıcının konumu gelmedi (SIGNAL_LOSS_TIMEOUT_MS, 30 sn); çıkış zamanı girişin
   * kapatıldığı andır (SignalLossSweeper).
   */
  SIGNAL_LOST = 'SIGNAL_LOST',
  /** Alanın şekli değişti ve kullanıcının son konumu yeni şeklin dışında kaldı. */
  AREA_CHANGED = 'AREA_CHANGED',
  /** Alan silindi. */
  AREA_REMOVED = 'AREA_REMOVED',
}

/**
 * Veritabanında (area_logs.exit_reason, tip area_exit_reason) saklanan sebepler. Normal çıkış
 * (LEFT) boş tutulur: konum işlemenin çıkış yazması sebep kolonuna dokunmaz.
 */
export const STORED_EXIT_REASONS = [
  ExitReason.SIGNAL_LOST,
  ExitReason.AREA_CHANGED,
  ExitReason.AREA_REMOVED,
] as const;
export type StoredExitReason = (typeof STORED_EXIT_REASONS)[number];
