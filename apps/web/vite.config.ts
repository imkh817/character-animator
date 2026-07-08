import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // API를 same-origin으로 프록시: CORS가 필요 없고 refresh 쿠키가 자연스럽게 동작한다
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
