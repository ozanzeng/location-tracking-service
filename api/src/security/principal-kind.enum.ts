/** İsteği kimin yaptığı. */
export enum PrincipalKind {
  /** Tam yetkili API anahtarı: mobil backend, gateway, filo sistemi, betikler. */
  SERVICE = 'service',
  /** Kullanıcı adı ve şifreyle giriş yapmış sürücü (oturum token'ı). */
  RIDER = 'rider',
  /** Operasyon panelinde kullanıcı adı ve şifreyle giriş yapmış yönetici (oturum token'ı). */
  ADMIN = 'admin',
}
