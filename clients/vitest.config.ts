import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** İstemci birim testleri (saf mantık); tarayıcı testleri e2e/ altında node:test ile çalışır. */
export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared/src', import.meta.url)) },
  },
  test: {
    include: ['driver/src/**/*.test.ts', 'ops/src/**/*.test.ts', 'shared/src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // vi.stubGlobal (ör. fetch) her testten sonra geri alınır.
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      // Hiç yüklenmeyen dosyalar da raporda görünsün (yoksa oran olduğundan yüksek çıkar).
      include: ['driver/src/**/*.{ts,tsx}', 'ops/src/**/*.{ts,tsx}', 'shared/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/main.tsx'],
    },
  },
});
