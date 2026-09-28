/**
 * Bir uç noktaya kimin erişebildiği. İşaretlenmemiş uç noktalar operasyon işleridir (loglar,
 * alan ve filo yönetimi): API anahtarı ya da yönetici oturumu.
 */
export enum Access {
  /** Varsayılan: API anahtarı ya da yönetici. */
  OPERATOR = 'operator',
  /** Giriş yapmış herkes: alan ve scooter listesi. */
  ANY = 'any',
  /** Konum kaynakları: API anahtarı ya da sürücü. Yönetici konum göndermez. */
  DEVICE = 'device',
  /** Sadece sürücü oturumu: kiralama, oturum bilgisi. Kimin adına işlem yapıldığı bellidir. */
  RIDER = 'rider',
  /** Sadece yönetici oturumu: yönetici çıkışı ve oturum bilgisi. */
  ADMIN = 'admin',
}
