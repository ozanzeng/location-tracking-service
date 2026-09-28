import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

/**
 * İki uygulamanın ortak Vite ayarı: @shared takma adı ve API proxy'si. Anahtar tarayıcı
 * koduna gömülmez; operasyon için geliştirme proxy'si ekler (üretimde nginx). Sürücü
 * uygulaması anahtar kullanmaz: sürücü hesabıyla giriş yapar.
 */
export function clientConfig(port: number, app: 'ops' | 'driver') {
  const headers: Record<string, string> = app === 'ops' ? { 'x-api-key': process.env.API_KEY ?? 'dev-api-key' } : {};
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
          headers,
        },
        '/socket.io': { target: API, ws: true, headers },
      },
    },
  });
}
