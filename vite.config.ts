import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readSettings } from './src/config.ts';
const config = await readSettings(undefined, false),
  backend = `http://127.0.0.1:${config.port ?? 4318}`;
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'office-authoring',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/api/')) return next();
          const origin = `http://127.0.0.1:${server.config.server.port}`;
          if (
            req.headers.host !== `127.0.0.1:${server.config.server.port}` ||
            (req.headers.origin && req.headers.origin !== origin)
          ) {
            res.statusCode = 403;
            res.end();
            return;
          }
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end();
            return;
          }
          next();
        });
      },
      handleHotUpdate(ctx) {
        if (/[\\/]office[\\/]|[\\/]public[\\/]assets[\\/]custom[\\/]/.test(ctx.file)) {
          ctx.server.ws.send({ type: 'full-reload' });
          return [];
        }
      },
    },
  ],
  build: { outDir: 'dist' },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: false,
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        headers: { Origin: backend },
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
});
