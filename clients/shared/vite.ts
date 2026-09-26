import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
// Anahtar tarayıcıya gömülmez; geliştirme proxy'si ekler (üretimde nginx).
const API_KEY = process.env.API_KEY ?? 'dev-api-key';

/** İki uygulamanın ortak Vite ayarı: @shared takma adı ve API proxy'si. */
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
          headers: { 'x-api-key': API_KEY },
        },
        '/socket.io': { target: API, ws: true, headers: { 'x-api-key': API_KEY } },
      },
    },
  });
}
