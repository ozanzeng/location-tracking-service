/** GET /health yanıtındaki genel durum. */
export enum HealthStatus {
  OK = 'ok',
  ERROR = 'error',
}

/** Bağımlılıkların (veritabanı, Redis) durumu. */
export enum DependencyStatus {
  UP = 'up',
  DOWN = 'down',
}
