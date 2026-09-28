/** İki uygulamanın ortak kullandığı ayarlar. */

/** Filo listesi, sunucunun duyurusu kaçarsa (bağlantı koptu) en geç bu aralıkla yenilenir. */
export const SCOOTERS_FALLBACK_REFRESH_MS = 15_000;

/** API adresi; nginx ve Vite geliştirme sunucusu /api'yi API'ye iletir. */
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/** Haritaların açılış merkezi (Kadıköy). */
export const MAP_CENTER: [number, number] = [40.984, 29.035];
