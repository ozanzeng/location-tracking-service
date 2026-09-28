/**
 * API ve worker'ın veritabanı yetkileri: sadece yaptıkları işler. Şema sahibi (migration'ları
 * çalıştıran kullanıcı) superuser'dır; uygulama onunla bağlansaydı bir SQL enjeksiyonu
 * sunucuda komut çalıştırmaya (COPY ... TO PROGRAM) kadar gidebilir, superuser'lara ayrılan
 * bağlantı yuvalarını da tüketirdi. Yeni bir tablo eklenirse buraya da eklenmeli.
 */
export const APP_TABLE_PRIVILEGES: Record<string, string[]> = {
  // Alan oluşturma, listeleme, düzenleme ve silme (deleted_at güncellemesi; yumuşak silme).
  areas: ['SELECT', 'INSERT', 'UPDATE'],
  // Giriş (INSERT) ve çıkış (UPDATE exit_time).
  area_logs: ['SELECT', 'INSERT', 'UPDATE'],
  // Son konum upsert'i.
  user_last_location: ['SELECT', 'INSERT', 'UPDATE'],
  // Filo: ekleme ve silme (deleted_at güncellemesi; yumuşak silme, DELETE yok).
  scooters: ['SELECT', 'INSERT', 'UPDATE'],
  // Üyelik ve giriş; girişte eski yöntemle özetlenmiş şifre yenilenir (sadece o kolon).
  // Kullanıcı adı değiştirme ve hesap silme API'de yok.
  riders: ['SELECT', 'INSERT', 'UPDATE (password_hash)'],
  // Kiralama başlatma (INSERT) ve bitirme (UPDATE ended_at).
  rentals: ['SELECT', 'INSERT', 'UPDATE'],
  // Yönetici girişi: hesaplar migrate adımında ya da admin betiğiyle (şema sahibi) açılır;
  // uygulama sadece okur, girişte son giriş anını ve eski özeti yeniler.
  admins: ['SELECT', 'UPDATE (password_hash, last_login_at)'],
};
