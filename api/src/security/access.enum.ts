/**
 * Bir uç noktaya kimin erişebildiği. İşaretlenmemiş uç noktalar sadece tam yetkili API
 * anahtarıyla çağrılır (loglar, alan oluşturma, filo yönetimi).
 */
export enum Access {
  /** API anahtarı ya da sürücü oturumu: konum gönderme, alan ve scooter listesi. */
  RIDER_OR_SERVICE = 'rider-or-service',
  /** Sadece sürücü oturumu: kiralama, oturum bilgisi. Kimin adına işlem yapıldığı bellidir. */
  RIDER = 'rider',
}
