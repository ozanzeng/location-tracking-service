import type { AppConfig } from '../config/configuration.js';

/**
 * API açılışında loglanan ayar uyarıları. Servis çalışır, ama yerel geliştirmede sessizce
 * bozulan bir şeye işaret ederler.
 */
export function securityWarnings(
  security: AppConfig['security'],
  env: NodeJS.ProcessEnv,
): string[] {
  if (security.apiKeys.length === 0) {
    return [
      'API_KEYS tanımlı değil: kimlik doğrulama kapalı (sadece yerel geliştirme için)',
    ];
  }
  // Eski .env.example'dan kopyalanmış yerel ayarda sürücü anahtarı yoktur ve sürücü
  // uygulamasının her isteği 401 alır. Production'da sürücü anahtarı olmaması geçerli bir
  // kurulumdur (herkese açık istemci yok), orada uyarılmaz.
  if (security.ingestApiKeys.length === 0 && env.NODE_ENV !== 'production') {
    return [
      'INGEST_API_KEYS tanımlı değil: sürücü uygulamasının anahtarı (dev-driver-key) her istekte 401 alır. ' +
        'Yerel geliştirmede api/.env içine INGEST_API_KEYS=dev-driver-key ekleyin.',
    ];
  }
  return [];
}
