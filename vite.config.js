import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';

// Off-Base44 config: the @base44/vite-plugin has been removed. It previously
// provided the "@" → /src import alias, so we define that here.
// The app now talks to the self-hosted RazeKit backend via src/api/base44Client.js
// (set VITE_API_BASE_URL in .env.local).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  server: {
    port: 5173,
  },
});
