/** Geçersiz ortam değişkenleri; servis açılmadan hepsi birlikte raporlanır. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Geçersiz ayarlar:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}
