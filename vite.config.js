import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';

// RazeKit frontend → self-hosted RazeKit API (set VITE_API_URL in .env.local).
//
// VITE_DEV_API_PROXY optionally forwards the dev server's own /api, /files and
// /r paths to a remote API. It exists so a developer can run the real UI against
// a deployed backend without that backend having to allow a localhost origin —
// the browser only ever talks to the dev server, so no cross-origin request is
// made and production CORS stays as tight as it is. Set VITE_API_URL to the dev
// server's own origin when using it. Dev only; `vite build` never reads this.
export default defineConfig(({ mode }) => {
  // loadEnv, not process.env: the value lives in .env.local, which Vite exposes
  // to the client bundle but does not put on process.env for the config itself.
  const env = loadEnv(mode, process.cwd(), '');
  const devApiProxy = env.VITE_DEV_API_PROXY;
  // Anchored regexes, not bare prefixes. Vite matches a plain string key as a
  // PREFIX, so '/r' — the tracking-redirect mount — also swallowed '/register',
  // '/review' and '/reports', and the dev server answered them with the API's
  // 404 instead of the app. Each path only ever has children, so requiring the
  // trailing slash is both correct and enough.
  const proxy = devApiProxy
    ? Object.fromEntries(
        ['^/api/', '^/files/', '^/r/'].map((p) => [p, { target: devApiProxy, changeOrigin: true, secure: true }]),
      )
    : undefined;

  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
    // A real boolean literal, not a string read from import.meta.env.
    //
    // This is what makes the Development area disappear from the bundle rather
    // than merely hide inside it. Reading `import.meta.env.VITE_DEV_AREA_ENABLED`
    // leaves a runtime comparison that Rollup cannot fold, so the routes and
    // page chunks survive the build; substituting `false` here lets everything
    // behind the flag be eliminated. Verified by checking dist for the chunks.
    define: {
      __DEV_AREA_VISIBLE__: JSON.stringify(env.VITE_DEV_AREA_ENABLED === 'true'),
    },
    server: { port: 5173, proxy },
  };
});
