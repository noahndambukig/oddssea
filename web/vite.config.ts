import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Fixed port so the URL is predictable. Increment B registers
    // http://localhost:5173/callback with Cognito, and OAuth redirect URLs
    // are matched as exact strings — a drifting port would break login.
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
