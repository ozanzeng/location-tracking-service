import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

/**
 * İki uygulamanın ortak Vite ayarı: @shared takma adı ve API proxy'si. İki uygulama da API
 * anahtarı kullanmaz: sürücü sürücü hesabıyla, operasyon yönetici hesabıyla giriş yapar.
 */
export function clientConfig(port: number) {
  return defineConfig({
    plugins: [react()],
    resolve: {
      alias: { '@shared': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port,
      strictPort: true,
      proxy: {
        '/api': {
          target: API,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/socket.io': { target: API, ws: true },
      },
    },
  });
}
