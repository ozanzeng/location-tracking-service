import type { AppConfig, ConfigContext } from './configuration.types.js';
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  DB_ROLE_NAME_PATTERN,
  DEMO_ADMIN_PASSWORD,
  MIN_PRODUCTION_KEY_LENGTH,
  PASSWORD_MAX_LENGTH,
  USERNAME_PATTERN,
} from './limits.js';

/** Redis adresi redis:// ya da rediss:// olmalı. */
export function readRedisUrl({ env, problems }: ConfigContext): string {
  const redisUrl = env.REDIS_URL ?? 'redis://localhost:6390';
  try {
    const { protocol } = new URL(redisUrl);
    if (protocol !== 'redis:' && protocol !== 'rediss:') throw new Error();
  } catch {
    problems.push(
      `REDIS_URL redis:// veya rediss:// adresi olmalı (verilen: "${redisUrl}")`,
    );
  }
  return redisUrl;
}

/**
 * API anahtarları. Kurallar sadece API sunucusunda (apiServer): worker, migration ve smoke
 * betikleri anahtar kullanmaz, production'da anahtarsız da açılmalı.
 */
export function readApiKeys(
  { production, problems, read }: ConfigContext,
  apiServer: boolean,
): string[] {
  const apiKeys = read.list('API_KEYS');
  if (!apiServer) return apiKeys;
  if (production && apiKeys.length === 0) {
    problems.push(
      'API_KEYS production ortamında zorunlu (virgülle ayrılmış bir veya daha fazla anahtar)',
    );
  }
  // Eski kurulumdan kalan ayar sessizce yok sayılmasın: sürücü anahtarı artık yok.
  if (read.list('INGEST_API_KEYS').length > 0) {
    problems.push(
      'INGEST_API_KEYS kaldırıldı: sürücüler artık kullanıcı adı ve şifreyle giriş yapıyor (README, "Scooterlar ve sürücü hesapları"). Ayarı silin.',
    );
  }
  const weak = apiKeys.filter((key) => key.length < MIN_PRODUCTION_KEY_LENGTH);
  if (production && weak.length > 0) {
    problems.push(
      `Production'da anahtarlar en az ${MIN_PRODUCTION_KEY_LENGTH} karakter olmalı; ${weak.length} anahtar daha kısa (ör. openssl rand -hex 24 ile üretin)`,
    );
  }
  return apiKeys;
}

/** CORS origin'leri. Production'da açıkça verilmedikçe tarayıcıdan çapraz kaynak erişimi kapalı. */
export function readCorsOrigins({
  env,
  production,
  problems,
  read,
}: ConfigContext): string[] {
  const corsOrigins =
    env.CORS_ORIGINS !== undefined
      ? read.list('CORS_ORIGINS')
      : production
        ? []
        : ['*'];
  for (const origin of corsOrigins) {
    if (origin === '*') continue;
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
        throw new Error();
    } catch {
      problems.push(
        `CORS_ORIGINS içindeki "${origin}" geçerli bir origin değil (ör. https://ops.example.com)`,
      );
    }
  }
  return corsOrigins;
}

/** Migrate betiğinin yönettiği uygulama rolü (DB_APP_USER, DB_APP_PASSWORD). */
export function checkAppRole({ env, problems }: ConfigContext): void {
  if (!env.DB_APP_USER) return;
  if (!DB_ROLE_NAME_PATTERN.test(env.DB_APP_USER)) {
    problems.push(
      `DB_APP_USER küçük harf, rakam ve _ içermeli (verilen: "${env.DB_APP_USER}")`,
    );
  }
  if (!env.DB_APP_PASSWORD) {
    problems.push('DB_APP_USER verildiyse DB_APP_PASSWORD de verilmeli');
  }
  if (env.DB_APP_USER === (env.DB_USER ?? 'geofence')) {
    problems.push(
      "DB_APP_USER, migration'ları çalıştıran DB_USER ile aynı olamaz",
    );
  }
}

/** Migrate adımında oluşturulan ilk yönetici; ad ve şifre birlikte verilir. */
export function readInitialAdmin({
  env,
  production,
  problems,
}: ConfigContext): AppConfig['security']['initialAdmin'] {
  const username = env.ADMIN_USERNAME?.trim().toLowerCase() ?? '';
  const password = env.ADMIN_PASSWORD ?? '';
  if (!username && !password) return undefined;
  if (!USERNAME_PATTERN.test(username)) {
    problems.push(
      `ADMIN_USERNAME 3–32 karakter olmalı; sadece harf, rakam ve _ . - (verilen: "${env.ADMIN_USERNAME ?? ''}")`,
    );
  }
  if (
    password.length < ADMIN_PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    problems.push(
      `ADMIN_PASSWORD ${ADMIN_PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} karakter olmalı`,
    );
  }
  if (production && password === DEMO_ADMIN_PASSWORD) {
    problems.push(
      "ADMIN_PASSWORD production'da demo şifresi olamaz (ör. openssl rand -base64 18 ile üretin)",
    );
  }
  return { username, password };
}
