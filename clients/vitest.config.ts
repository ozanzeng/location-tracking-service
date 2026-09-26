import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** İstemci birim testleri (saf mantık); tarayıcı testleri e2e/ altında node:test ile çalışır. */
export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared/src', import.meta.url)) },
  },
  test: {
    include: ['driver/src/**/*.test.ts', 'ops/src/**/*.test.ts', 'shared/src/**/*.test.ts'],
  },
});
