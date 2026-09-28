/** İsteği kimin yaptığı. */
export enum PrincipalKind {
  /** Tam yetkili API anahtarı: mobil backend, gateway, operasyon paneli, betikler. */
  SERVICE = 'service',
  /** Kullanıcı adı ve şifreyle giriş yapmış sürücü (oturum token'ı). */
  RIDER = 'rider',
}
