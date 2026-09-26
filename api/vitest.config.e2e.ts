import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/e2e-env.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Dosyalar aynı test veritabanını paylaştığı için sırayla çalışır.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
