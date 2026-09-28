/** Giriş kaydının neden kapandığı (veritabanında area_exit_reason); normal çıkışta boş. */
export enum ExitReason {
  /** Scooter SIGNAL_LOSS_TIMEOUT_MS boyunca konum göndermedi; son sinyal anıyla kapatıldı. */
  SIGNAL_LOST = 'SIGNAL_LOST',
  /** Alanın şekli değişti ve scooter'ın son konumu yeni şeklin dışında kaldı. */
  AREA_CHANGED = 'AREA_CHANGED',
  /** Alan silindi. */
  AREA_REMOVED = 'AREA_REMOVED',
}
