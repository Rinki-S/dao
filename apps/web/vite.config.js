import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3766',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:3766',
        changeOrigin: true,
      },
    },
  },
});
