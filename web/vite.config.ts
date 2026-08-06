import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [react()],
    server: {
      // Fixed port so the URL is predictable. Cognito registers
      // http://localhost:5173/auth/callback, and OAuth redirect URLs are
      // matched as exact strings — a drifting port would break login.
      port: 5173,
      strictPort: true,
      proxy: {
        /**
         * Send /auth/* to the deployed API, exactly as CloudFront does in
         * production.
         *
         * WITHOUT THIS, LOCAL LOGIN BREAKS IN A CONFUSING WAY. Vite's dev
         * server answers any unmatched path with index.html and a 200 — the
         * same SPA fallback that caused the config.json bug in Increment C —
         * so the OAuth callback would land in the React app instead of the
         * BFF. "The browser never sees the code" would be true in production
         * and false locally, which is the worst kind of difference.
         *
         * `changeOrigin` rewrites the Host header, which API Gateway
         * requires. Cookies still come back to localhost, so the session
         * behaves as it does deployed.
         */
        '/auth': {
          target: env.VITE_API_URL,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
