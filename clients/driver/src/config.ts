import type { LatLng } from './geo/latlng';

/** Case: mobil uygulama aktifken yaklaşık 5 saniyede bir konum gönderir. */
export const GPS_INTERVAL_MS = 5000;
/** Rota oynatılırken konumun güncellenme aralığı. */
export const PLAYBACK_TICK_MS = 500;
/** Bölge bildiriminin (levhanın) ekranda kalma süresi. */
export const PLATE_MS = 6000;

/** Uygulama açıldığında scooter'ın bulunduğu yer (Bahariye Caddesi); yol ağı yüklenince en yakın yola taşınır. */
export const START_POSITION: LatLng = { lat: 40.9878, lng: 29.0292 };
export const START_SNAP_METERS = 200;
/** Tıklamanın yola yapışacağı en uzak mesafe; daha uzaksa (arsa ortası, deniz) yok sayılır. */
export const SNAP_METERS = 60;
/** Bir durağın üzerine gelindi sayılması için imlecin durağa en fazla uzaklığı (px). */
export const STOP_HIT_PX = 14;
/** Arsaya tekrar tıklanınca aynı yol noktasına yapışırsa da aynı durak sayılır (m). */
export const SAME_STOP_METERS = 5;

export const ROADS_URL = '/roads-kadikoy.json';
export const SCOOTER_ID_KEY = 'driver.scooterId';
