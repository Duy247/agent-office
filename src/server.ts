import express from 'express';
import type { Response } from 'express';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { readSettings, updateLocalConfig, projectRoot } from './config.ts';
import { OfficeFeeds, publicServers } from './office-servers.ts';
import { createConnector } from './connectors/index.ts';
import { allowsOfficeRequest } from './access.ts';
import { precompressedAssets, assetCacheControl } from './static-assets.ts';
const config = await readSettings(),
  root = projectRoot;
const port =
  Number.isInteger(config.port) && config.port > 1024 && config.port < 65536 ? config.port : 4318;
const clients = new Set<Response>();
const feeds = new OfficeFeeds(config, createConnector, (patch) => updateLocalConfig(patch));
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!allowsOfficeRequest(req.headers.host, req.headers.origin, port, config.publicOrigin))
    return void res.status(403).end();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' data: blob:; frame-ancestors 'none'",
  );
  if (req.method !== 'GET') return void res.status(405).end();
  next();
});
app.get('/api/servers', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ defaultId: 'default', servers: publicServers(feeds.definitions) });
});
app.get('/api/state', (req, res) => {
  const id = req.query.server === undefined ? 'default' : req.query.server;
  if (typeof id !== 'string') return void res.status(400).end();
  const wire = feeds.snapshot(id);
  if (!wire) return void res.status(404).json({ error: 'Server is not configured.' });
  res.setHeader('Cache-Control', 'no-store');
  res.type('json').send(wire);
});
app.get('/api/events', (req, res) => {
  if (clients.size >= 12) return void res.status(503).end();
  const id = req.query.server === undefined ? 'default' : req.query.server;
  if (typeof id !== 'string') return void res.status(400).end();
  if (!feeds.definitions.some((s) => s.id === id)) return void res.status(404).end();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
  clients.add(res);
  const unsubscribe = feeds.subscribe(id, (wire) => {
    if (res.writableLength > 1024 * 1024) res.end();
    else res.write('data: ' + wire + '\n\n');
  });
  const keep = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keep);
    clients.delete(res);
    unsubscribe?.();
  });
});
const compressedAvatars = new WeakMap<Buffer, Buffer>();
app.get('/api/avatar', async (req, res) => {
  const { server = 'default', agent, v } = req.query;
  if (
    typeof server !== 'string' ||
    typeof agent !== 'string' ||
    typeof v !== 'string' ||
    v.length > 512
  )
    return void res.status(400).end();
  try {
    const image = await feeds.avatar(server, agent, v);
    if (!image) return void res.status(404).end();
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    );
    res.setHeader('Vary', 'Accept-Encoding');
    if (image.mimeType === 'image/svg+xml' && /\bbr\b/.test(req.headers['accept-encoding'] ?? '')) {
      let compressed = compressedAvatars.get(image.bytes);
      if (!compressed) {
        compressed = brotliCompressSync(image.bytes, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
        });
        compressedAvatars.set(image.bytes, compressed);
      }
      res.setHeader('Content-Encoding', 'br');
      res.send(compressed);
    } else res.send(image.bytes);
  } catch {
    res.status(503).end();
  }
});
app.use(precompressedAssets(join(root, 'dist')));
app.use(
  express.static(join(root, 'dist'), {
    etag: true,
    setHeaders(res, path) {
      res.setHeader('Cache-Control', assetCacheControl(path));
    },
  }),
);
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Office dashboard: http://127.0.0.1:${port}`),
);
function close() {
  feeds.close();
  for (const r of clients) r.end();
  server.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
