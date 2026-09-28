/**
 * API sözleşmesinin sınırlarının istemcideki karşılıkları. Kaynak api/src/config/limits.ts;
 * biri değişirse diğeri de değişmeli. Formlar bunları gönderimden önce uygular, sunucu yine
 * kendisi doğrular.
 */

/** Scooter kimliği (konumlardaki userId): harf, rakam ve _ . : - */
export const SCOOTER_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
export const SCOOTER_ID_MAX_LENGTH = 64;
export const SCOOTER_NAME_MAX_LENGTH = 80;

export const AREA_NAME_MAX_LENGTH = 120;

/** Sürücü kullanıcı adı ve şifresi. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
