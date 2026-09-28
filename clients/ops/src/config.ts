/** Operasyon uygulamasının ayarları. */

/**
 * Canlı haritada scooter'ın durumu: cihazlar 5 sn'de bir gönderir. Bu kadar sessiz kalan
 * soluklaşır (sürüş bitmiş, sekme kapanmış ya da bağlantı kopmuş olabilir)...
 */
export const SCOOTER_IDLE_MS = 15_000;
/** ...bu kadar sessiz kalan haritadan ve "aktif" sayacından düşer. */
export const SCOOTER_ACTIVE_MS = 60_000;
/** Canlı haritadaki sayaçların ve soluklaştırmanın yenilenme aralığı. */
export const SCOOTER_REFRESH_MS = 1000;

/** Olay akışında tutulan en fazla olay ve açılışta geçmişten çekilen kayıt sayısı. */
export const FEED_LIMIT = 60;
export const FEED_HISTORY_SIZE = 40;

/** Giriş kayıtları ekranında sayfa başına kayıt. */
export const LOGS_PAGE_SIZE = 50;
/**
 * Açık girişin kullanıcısından bu kadar süredir konum gelmiyorsa "İçeride" yerine "Sinyal yok"
 * gösterilir (canlı haritada soluklaştığı süreyle aynı). Sunucu 30 sn'de girişi "sinyal
 * kesildi" olarak kapatır (SIGNAL_LOSS_TIMEOUT_MS); liste yenilenene kadar ara durum budur.
 */
export const LOGS_NO_SIGNAL_MS = SCOOTER_IDLE_MS;
/** Kayıtlar ekranında "Sinyal yok · X önce" yazılarının yenilenme aralığı. */
export const LOGS_CLOCK_MS = 10_000;

/** Üst çubuktaki servis durumunun (GET /health) yenilenme aralığı. */
export const HEALTH_POLL_MS = 5000;

/** Scooter detay paneli açıkken yenilenme aralığı (cihaz 5 sn'de bir gönderir). */
export const SCOOTER_DETAIL_REFRESH_MS = 5000;
