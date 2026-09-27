/**
 * API sözleşmesinin sabit sınırları. Ortama göre değişmezler (onlar AppConfig'te, env ile):
 * değiştirmek istemcilerin gördüğü davranışı değiştirir, bu yüzden kodda ve tek yerde durur.
 */

/** userId: opak kimlik; harf, rakam ve _ . : - */
export const USER_ID_MAX_LENGTH = 64;
export const USER_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;

/** Bir toplu istekteki en fazla konum. Sürücü uygulamasındaki karşılığı: OUTBOX_MAX_BATCH. */
export const MAX_BATCH_SIZE = 100;

/**
 * Cihaz saatinin sunucudan ileride olmasına izin verilen pay. Daha ilerideki konum, sonraki
 * gerçek konumların "eski" sayılıp atlanmasına yol açardı.
 */
export const MAX_CLOCK_SKEW_MS = 60_000;

/** Rate limit penceresi: RATE_LIMIT_USER_PER_MIN dakikalıktır. */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

export const AREA_NAME_MAX_LENGTH = 120;
/** Bir polygon'daki en fazla köşe (tüm halkalar); aşırı büyük geometri reddedilir. */
export const MAX_POLYGON_VERTICES = 10_000;

/** GET /logs sayfa boyutu. */
export const LOGS_PAGE_DEFAULT = 50;
export const LOGS_PAGE_MAX = 500;

/** GET /locations/latest: kaç dakika geriye ve en fazla kaç kullanıcı. */
export const LATEST_SINCE_MINUTES_DEFAULT = 30;
export const LATEST_SINCE_MINUTES_MAX = 24 * 60;
export const LATEST_LIMIT_DEFAULT = 1000;
export const LATEST_LIMIT_MAX = 5000;

/** Gelen x-request-id bu biçimde değilse yok sayılır ve yenisi üretilir. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
