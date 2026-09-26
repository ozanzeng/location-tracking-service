import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, rewrite: (path) => path.replace(/^\/api/, '') },
      '/socket.io': { target: API, ws: true },
    },
  },
});
