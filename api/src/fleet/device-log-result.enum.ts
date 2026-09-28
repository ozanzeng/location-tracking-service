/** Sunucunun bir konumla ne yaptığı (cihaz günlüğü). */
export enum DeviceLogResult {
  /** İşlendi: son konum güncellendi, varsa giriş/çıkış yazıldı. */
  PROCESSED = 'PROCESSED',
  /** Daha yeni bir konum zaten işlenmişti (ağda gecikmiş); durumu geriye götürmesin diye atlandı. */
  STALE = 'STALE',
}
