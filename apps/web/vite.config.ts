/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Use the shared contract's TypeScript source directly (no build step needed in dev).
      '@slotpilot/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Same-origin in development too: cookies and WebSockets behave exactly like production.
    proxy: {
      '/api': { target: API_URL, changeOrigin: true },
      '/socket.io': { target: API_URL, ws: true, changeOrigin: true },
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // One long-lived vendor chunk: app deploys don't bust the cache for React & co.
        // (Splitting React across several chunks creates circular CommonJS chunks that crash at load.)
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    testTimeout: 20000,
  },
});
