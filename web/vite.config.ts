/**
 * フロントエンドのビルド設定。仕様は docs/design/CHAT.md。
 *
 * dev は Vite のプロキシで Express API（127.0.0.1:4517）へ流し、
 * 本番は `vite build web` の成果物 web/dist を Express が静的配信する。
 */
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4517',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
