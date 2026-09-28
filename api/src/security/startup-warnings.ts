import type { AppConfig } from '../config/configuration.types.js';

/**
 * API açılışında loglanan ayar uyarıları. Servis çalışır, ama yerel geliştirmede sessizce
 * bozulan bir şeye işaret ederler.
 */
export function securityWarnings(security: AppConfig['security']): string[] {
  if (security.apiKeys.length === 0) {
    return [
      'API_KEYS tanımlı değil: kimlik doğrulama kapalı (sadece yerel geliştirme için)',
    ];
  }
  return [];
}
