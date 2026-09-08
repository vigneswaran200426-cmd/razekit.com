import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';

// RazeKit frontend → self-hosted RazeKit API (set VITE_API_URL in .env.local).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  server: { port: 5173 },
});
