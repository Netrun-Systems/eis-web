import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // WEB-003 API server (npm run dev:api). Same-origin in dev via proxy;
    // the API additionally allows CORS from http://localhost:5173 only.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? 3001}`,
        changeOrigin: false,
      },
    },
  },
});
