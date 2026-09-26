import { defineConfig } from 'vitest/config';

/** Veritabanı testleri: migration'lar, kısıtlar, sorgu planları. Gerçek PostGIS gerekir. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/db/**/*.db-spec.ts'],
    setupFiles: ['./test/e2e-env.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
