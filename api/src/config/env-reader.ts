import type { EnvReader } from './configuration.types.js';

/**
 * Ortam değişkeni okuyucusu. Verilmeyen değer için varsayılan döner; verilen ama geçersiz
 * değer sessizce varsayılana düşmez, `problems` listesine yazılır (hepsi birlikte raporlanır).
 */
export function createEnvReader(
  env: NodeJS.ProcessEnv,
  problems: string[],
): EnvReader {
  return {
    int(name, fallback, min, max) {
      const raw = env[name];
      if (raw === undefined || raw === '') return fallback;
      const value = Number(raw);
      if (!Number.isInteger(value) || value < min || value > max) {
        problems.push(
          `${name} ${min}–${max} arasında bir tam sayı olmalı (verilen: "${raw}")`,
        );
        return fallback;
      }
      return value;
    },
    list(name) {
      return (env[name] ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    },
    oneOf(name, allowed) {
      const raw = env[name];
      if (raw !== undefined && raw !== '' && !allowed.includes(raw)) {
        problems.push(
          `${name} şunlardan biri olmalı: ${allowed.join(', ')} (verilen: "${raw}")`,
        );
      }
    },
  };
}
