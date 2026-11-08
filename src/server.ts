import express from 'express';
import type { Response } from 'express';
import { join } from 'node:path';
import { readSettings, updateLocalConfig, projectRoot } from './config.ts';
import { publicSnapshot } from './boundary.ts';
import { createConnector } from './connectors/index.ts';
const config = await readSettings(),
  root = projectRoot;
const port =
  Number.isInteger(config.port) && config.port > 1024 && config.port < 65536 ? config.port : 4318;
const clients = new Set<Response>(),
  controller = new AbortController();
let snapshot = publicSnapshot({
  connection: 'connecting',
  message: 'Connecting',
  agents: [],
  groups: [],
});
function publish() {
  const data = 'data: ' + JSON.stringify(snapshot) + '\n\n';
  for (const r of clients) {
    if (r.writableLength > 1024 * 1024) {
      r.end();
      clients.delete(r);
    } else r.write(data);
  }
}
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (
    req.headers.host !== `127.0.0.1:${port}` ||
    (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`)
  )
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
app.get('/api/state', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(snapshot);
});
app.get('/api/events', (req, res) => {
  if (clients.size >= 12) return void res.status(503).end();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
  clients.add(res);
  res.write('data: ' + JSON.stringify(snapshot) + '\n\n');
  const keep = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keep);
    clients.delete(res);
  });
});
app.use(express.static(join(root, 'dist'), { etag: true }));
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Office dashboard: http://127.0.0.1:${port}`),
);
const connector = createConnector(
  config.connector?.type ?? 'demo',
  config.connector?.options ?? {},
);
void connector
  .start({
    signal: controller.signal,
    config,
    emit(value) {
      snapshot = publicSnapshot(value);
      publish();
    },
    saveAppearance: (patch) => updateLocalConfig(patch),
  })
  .catch(() => {
    snapshot = {
      ...snapshot,
      connection: 'disconnected',
      message: 'Connector stopped. Check the adapter configuration.',
    };
    publish();
  });
function close() {
  controller.abort();
  for (const r of clients) r.end();
  server.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
