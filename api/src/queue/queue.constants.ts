/**
 * Şeritlerden önceki tek kuyruk. Redis AOF ile kalıcı olduğu için güncelleme sırasında
 * içinde iş kalmış olabilir; worker'lar onu da (şerit gibi, tek tek) işler.
 */
export const LEGACY_LOCATION_QUEUE = 'locations';
export const LOCATION_JOB = 'location';

/**
 * Kurulu şerit sayısını ilk açılan süreç yazar; sonrakiler aynı sayıyla açılmalı.
 * KEYS: düzen anahtarı. ARGV: şerit sayısı. Kayıtlı değeri döner.
 */
export const LAYOUT_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1], 'NX')
return redis.call('GET', KEYS[1])
`;
