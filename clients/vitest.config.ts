import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** İstemci birim testleri (mantık, hook ve bileşen); tarayıcı testleri e2e/ altında node:test ile çalışır. */
export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared/src', import.meta.url)) },
  },
  test: {
    include: ['driver/src/**/*.test.{ts,tsx}', 'ops/src/**/*.test.{ts,tsx}', 'shared/src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    // vi.stubGlobal (ör. fetch) her testten sonra geri alınır.
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      // Hiç yüklenmeyen dosyalar da raporda görünsün (yoksa oran olduğundan yüksek çıkar).
      include: ['driver/src/**/*.{ts,tsx}', 'ops/src/**/*.{ts,tsx}', 'shared/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/main.tsx'],
    },
  },
});
