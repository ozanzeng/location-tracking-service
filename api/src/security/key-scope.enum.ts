/** API anahtarının yetkisi (bkz. AppConfig.security). */
export enum KeyScope {
  /** Her şey: loglar, alan oluşturma, tüm filonun canlı yayını. */
  FULL = 'full',
  /** Sadece konum gönderme, alan listesi ve tek kullanıcı odası (sürücü uygulaması). */
  INGEST = 'ingest',
}
