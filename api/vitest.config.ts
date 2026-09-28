import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // Hiç yüklenmeyen dosyalar da raporda görünsün (yoksa oran olduğundan yüksek çıkar).
      // Birim testleri; e2e'nin kapsadığı controller/gateway gibi dosyalar burada düşük görünür.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/database/migrations/**',
        'src/main.ts',
        'src/worker.ts',
      ],
    },
  },
});
