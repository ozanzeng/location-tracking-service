/** Girişin nasıl kapandığı. */
export enum ExitReason {
  /** Kullanıcının alan dışındaki konumu geldi. */
  LEFT = 'LEFT',
  /** Kullanıcının konumu gelmedi (SIGNAL_LOSS_TIMEOUT_MS, 30 sn); çıkış zamanı girişin kapatıldığı andır. */
  SIGNAL_LOST = 'SIGNAL_LOST',
}
