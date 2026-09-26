import { existsSync } from 'node:fs';

/** Yerel geliştirmede .env dosyasını yükler; container'da env zaten verilmiştir. */
export function loadEnvFile(path = '.env'): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
