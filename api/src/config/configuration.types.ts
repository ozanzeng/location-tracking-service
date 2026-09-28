export interface AppConfig {
  port: number;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    poolSize: number;
    /** Tek bir sorgunun en uzun süresi (ms); 0 kapatır. Takılan sorgu bağlantıyı tutmasın. */
    statementTimeoutMs: number;
    /** Transaction içinde boşta kalınabilecek en uzun süre (ms); 0 kapatır. Kilit sızmasın. */
    idleInTransactionTimeoutMs: number;
    /**
     * Migration'ların kilit bekleme sınırı (ms); 0 kapatır. Uzun bir işlemin tuttuğu tabloda
     * deploy süresiz beklemesin (bkz. migrationOptions).
     */
    migrationLockTimeoutMs: number;
    /**
     * Migrate betiği için: API ve worker'ın bağlandığı, sadece gereken yetkileri olan rol
     * (bkz. database/app-role.ts). Verilmezse rol yönetilmez.
     */
    appUser?: string;
    appPassword?: string;
  };
  redisUrl: string;
  queue: {
    name: string;
    /** Redis üzerindeki BullMQ anahtar öneki; testler kendi önekini kullanır. */
    prefix: string;
    /**
     * Şerit sayısı: her kullanıcı sabit bir şeride düşer, şeritte aynı anda tek iş çalışır.
     * Aynı anda işlenebilecek en fazla iş sayısıdır. API ve worker'da aynı olmalı.
     */
    lanes: number;
    /** İncelemek için Redis'te tutulan tamamlanmış iş sayısı (tüm şeritlerin toplamı). */
    keepCompleted: number;
    /** İncelemek için Redis'te tutulan başarısız iş sayısı (tüm şeritlerin toplamı). */
    keepFailed: number;
  };
  worker: {
    /**
     * İşin kilit süresi (ms). Worker kilidi bunun yarısı aralıkla yeniler; yenileyemezse
     * (çöktü, bağlantısı koptu) iş başka worker'a geçer.
     */
    lockMs: number;
    /** Kilidi düşmüş işlerin aranma aralığı (ms). */
    stalledCheckMs: number;
    /** Kalıcı hatada (veri ya da kod hatası) bir noktanın en fazla deneme sayısı. */
    pointAttempts: number;
    /** Denemeler arası ilk bekleme (ms); her denemede ikiye katlanır. */
    retryBaseDelayMs: number;
    /** Denemeler arası en uzun bekleme (ms). */
    retryMaxDelayMs: number;
    /**
     * Geçici altyapı hatasında (veritabanı kapalı, yeniden başlıyor) nokta bu süre boyunca
     * tekrar denenir (ms): kesinti geçince iş kaldığı yerden devam eder, konum kaybolmaz.
     */
    transientRetryMs: number;
    /**
     * İşin kaç kez "takıldı" (kilidi düştü) sayılabileceği; fazlasında iş başarısız olur.
     * Sürekli worker'ı çökerten bir iş şeridi sonsuza dek tıkamasın, ama makine donması gibi
     * geçici takılmalar konum kaybettirmesin.
     */
    maxStalledCount: number;
    /** Kapanışta aktif işin bitmesi için beklenen en uzun süre (ms); sonra iş başka worker'a kalır. */
    shutdownGraceMs: number;
    /**
     * Bu kadar süre (ms) konumu gelmeyen kullanıcının açık girişleri "sinyal kesildi" olarak
     * kapatılır (çıkış zamanı: kapatıldığı an); 0 kapatır. Kuyrukta bekleyen konumlar için
     * arama ayrıca en eski bekleyen işin yaşı kadar pay bırakır.
     */
    signalLossTimeoutMs: number;
    /** Sinyali kesilen kullanıcıların ve sessiz kiralamaların aranma aralığı (ms). */
    signalLossSweepMs: number;
    /**
     * Bu kadar süre (ms) konumu gelmeyen scooter'ın kiralaması biter ve scooter boşa çıkar;
     * 0 kapatır. Girişlerden (SIGNAL_LOSS_TIMEOUT_MS) uzun: kısa bir ağ kopmasında sürücü
     * scooter'ını kaybetmesin. Sessizlik sunucu saatiyle (seen_at) ölçülür.
     */
    rentalIdleTimeoutMs: number;
  };
  retention: {
    /**
     * Çıkışı bu kadar günden eski giriş kayıtları silinir (LOG_RETENTION_DAYS); 0 kapatır.
     * Açık girişlere dokunulmaz. Silmeyi API ve worker değil, ayrı iş yapar (logs/log-retention.ts).
     */
    logDays: number;
    /** Sürekli çalışan saklama işinin (--loop) tur aralığı (ms). */
    intervalMs: number;
  };
  realtime: {
    enabled: boolean;
    /** Canlı pozisyonların socket'e toplu gönderilme aralığı (ms). */
    flushIntervalMs: number;
    /** Sunucunun bağlantılara ping gönderme aralığı (ms). */
    pingIntervalMs: number;
    /** Ping'e bu süre içinde cevap vermeyen bağlantı kapatılır (ms). */
    pingTimeoutMs: number;
  };
  security: {
    /** Tam yetkili API anahtarları. Boşsa kimlik doğrulama kapalıdır (yerel geliştirme). */
    apiKeys: string[];
    /**
     * Sürücü oturumunun geçerlilik süresi (saniye). Sürücüler kullanıcı adı ve şifreyle giriş
     * yapar; oturum bu süre sonunda düşer ve yeniden giriş gerekir.
     */
    riderSessionTtlSeconds: number;
    /** Yönetici (operasyon paneli) oturumunun geçerlilik süresi (saniye). */
    adminSessionTtlSeconds: number;
    /**
     * Migrate adımında yoksa oluşturulan ilk yönetici (ADMIN_USERNAME, ADMIN_PASSWORD). Var
     * olan hesabın şifresi değiştirilmez; şifre değiştirmek için admin betiği (README).
     */
    initialAdmin?: { username: string; password: string };
    /** Bir kullanıcı adına 15 dakikada izin verilen başarısız giriş; fazlası 429. 0 kapatır. */
    loginMaxAttempts: number;
    /** İzin verilen CORS origin'leri; ['*'] hepsine izin verir, [] kapatır. */
    corsOrigins: string[];
    /** Kullanıcı başına dakikada kabul edilen konum sayısı; 0 kapatır. */
    userRateLimitPerMinute: number;
  };
  backpressure: {
    /** Kuyrukta bekleyen iş bu sayıyı aşınca yeni konumlar 503 ile reddedilir; 0 kapatır. */
    maxBacklog: number;
    /** Kuyruk derinliğinin yeniden okunma aralığı (ms). */
    checkIntervalMs: number;
  };
  observability: {
    /** Worker'ın /metrics için dinlediği port; 0 kapatır. */
    workerMetricsPort: number;
    /**
     * Scooter başına sunucuda tutulan son işlenmiş konum sayısı (cihaz günlüğü, operasyon
     * ekranı için); 0 kapatır.
     */
    deviceLogSize: number;
    /** Cihaz günlüğünün son konumdan sonra saklanma süresi (saniye). */
    deviceLogTtlSeconds: number;
  };
}

export interface LoadConfigOptions {
  /**
   * API sunucusunun açılışı: anahtar kuralları sadece orada uygulanır. Worker, migration
   * ve smoke betikleri anahtar kullanmaz; production'da API_KEYS olmadan da çalışmalılar.
   */
  apiServer?: boolean;
}

/** Ortam değişkenlerini doğrulayarak okur (env-reader.ts). */
export interface EnvReader {
  /** Tam sayı; aralık dışı ya da sayı değilse sorun yazılır, varsayılan döner. */
  int(name: string, fallback: number, min: number, max: number): number;
  /** Virgülle ayrılmış liste; boşluklar ve boş öğeler atılır. */
  list(name: string): string[];
  /** Değer verildiyse izin verilenlerden biri olmalı. */
  oneOf(name: string, allowed: string[]): void;
}

/** Ortam, doğrulama sorunları ve okuyucu: kontrol fonksiyonlarının ortak girdisi. */
export interface ConfigContext {
  env: NodeJS.ProcessEnv;
  production: boolean;
  problems: string[];
  read: EnvReader;
}
