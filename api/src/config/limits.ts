/**
 * Kodda sabit duran sınırlar ve değerler; ortama göre değişmezler (onlar AppConfig'te, env ile).
 * Çoğu API sözleşmesinin parçasıdır: değiştirmek istemcilerin gördüğü davranışı değiştirir.
 * Sonda iç işleyişin sabitleri (şifre özeti, filo listesi, sinyal kaybı taraması) var.
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
/**
 * JSON istek gövdesi sınırı. 6 ondalıklı 10 bin köşe ~220 KB tutar; Express'in varsayılan
 * 100 KB'ı ile köşe sınırına hiç ulaşılamıyor, ~4,5 bin köşeden sonra açıklayıcı 400 yerine
 * genel 413 dönüyordu.
 */
export const JSON_BODY_LIMIT = '512kb';

/** GET /logs sayfa boyutu. */
export const LOGS_PAGE_DEFAULT = 50;
export const LOGS_PAGE_MAX = 500;

/** GET /locations/latest: kaç dakika geriye ve en fazla kaç kullanıcı. */
export const LATEST_SINCE_MINUTES_DEFAULT = 30;
export const LATEST_SINCE_MINUTES_MAX = 24 * 60;
export const LATEST_LIMIT_DEFAULT = 1000;
export const LATEST_LIMIT_MAX = 5000;

/**
 * Zaman damgası: ISO 8601 genişletilmiş biçim, saat dilimi zorunlu (Z ya da ±hh:mm).
 * Saat dilimsiz değer sunucunun saat dilimine göre yorumlanırdı; sıkışık (20260928T1000Z)
 * ve hafta (2026-W39-1) biçimlerini JS ve Postgres çözemez, 400 yerine 500 dönüyordu.
 * Var olmayan günler (2026-02-30) ayrıca reddedilir (bkz. isApiTimestamp).
 */
export const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
export const TIMESTAMP_EXAMPLE = '2026-09-28T10:00:00Z';

/** Log kaydı kimliği bigint'tir; cursor'daki kimlik bu aralığı aşamaz. */
export const MAX_LOG_ID = 9_223_372_036_854_775_807n;

/** Gelen x-request-id bu biçimde değilse yok sayılır ve yenisi üretilir. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** Scooter kimliği konumlardaki userId'dir (aynı biçim ve uzunluk); adı operasyon için. */
export const SCOOTER_NAME_MAX_LENGTH = 80;

/**
 * Sürücü kullanıcı adı: küçük harfle saklanır ("Ali" ile "ali" aynı hesap). Veritabanında
 * aynı kural CHECK kısıtı olarak da var (riders_username_format).
 */
export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
/** Şifre uzunluğu; üst sınır hash hesabının istek başına maliyetini sınırlar. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Yönetici şifresinin en kısa uzunluğu: panel tüm filoyu yönetir, sürücününkinden uzun. */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

/** Başarısız giriş denemeleri bu pencerede sayılır (bkz. LOGIN_MAX_ATTEMPTS). */
export const LOGIN_WINDOW_SECONDS = 15 * 60;

/**
 * Sürücünün aktif kiralaması Redis'te bu kadar saniye önbellekte tutulur: konum isteği her
 * seferinde veritabanına gitmesin. Kiralama başlarken ve biterken önbellek hemen güncellenir;
 * süre, silme bir sebeple kaçarsa eski bilginin en fazla ne kadar yaşayacağıdır.
 */
export const RENTAL_CACHE_TTL_SECONDS = 30;

/**
 * Şifre özeti (Argon2id), OWASP'ın ilk seçeneği: 19 MiB bellek, 2 tur, 1 iş parçacığı. Artırılırsa
 * eski özetler yine doğrulanır, sürücü giriş yapınca yenilenir (riders/password.ts).
 */
export const PASSWORD_HASH = {
  memoryKib: 19_456,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
  saltLength: 16,
} as const;

/** Bellekteki kayıtlı scooter listesi, filo duyurusu kaçarsa en geç bu aralıkla yenilenir. */
export const SCOOTER_REGISTRY_REFRESH_MS = 60_000;

/** Sinyal kaybı taramasında bir grupta ele alınan en fazla kullanıcı. */
export const SIGNAL_LOSS_BATCH = 500;

/**
 * Saklama işinde bir DELETE'in sildiği en fazla kayıt: kısa transaction'lar, tabloyu ve
 * replikasyonu uzun süre meşgul etmez; autovacuum arada boşalan yeri toplar.
 */
export const LOG_RETENTION_BATCH = 5000;
/** Saklama işinde gruplar arası bekleme (ms): yoğun saatte konum işlemeyle yarışmasın. */
export const LOG_RETENTION_PAUSE_MS = 100;

/** docker-compose'daki demo yönetici şifresi: production'da kabul edilmez. */
export const DEMO_ADMIN_PASSWORD = 'admin-demo-sifresi';

/** Production'da anahtarın en kısa uzunluğu: "dev-api-key" gibi tahmin edilebilir değerler geçmesin. */
export const MIN_PRODUCTION_KEY_LENGTH = 16;

/** Postgres rol adı (uygulama rolü): küçük harf, rakam ve _; en fazla 63 karakter. */
export const DB_ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

/** Sağlık kontrolünde veritabanı ve Redis için bekleme sınırı (ms): kontrol asılı kalmasın. */
export const HEALTH_CHECK_TIMEOUT_MS = 2000;
