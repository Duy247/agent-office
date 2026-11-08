import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { preferredEncoding, assetCacheControl, precompressedAssets } from '../src/static-assets.ts';
test('asset negotiation respects disabled encodings and only immutable hashed bundles get long caching', () => {
  assert.equal(preferredEncoding('gzip, br'), 'br');
  assert.equal(preferredEncoding('br;q=0, gzip'), 'gzip');
  assert.equal(preferredEncoding('br;q=0, gzip;q=0'), undefined);
  assert.equal(preferredEncoding(undefined), undefined);
  assert.match(assetCacheControl('/dist/assets/index-a1B2c3D4.js.br'), /immutable/);
  for (const path of [
    '/dist/index.html',
    '/dist/assets/local/company-logo.svg',
    '/dist/assets/furniture-3d/office-models.json',
  ])
    assert.ok(!assetCacheControl(path).includes('immutable'));
});
test('compressed static delivery preserves MIME, query strings, caching, range fallback and traversal protection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'office-static-'));
  const directory = join(root, 'dist'),
    assets = join(directory, 'assets');
  await mkdir(assets, { recursive: true });
  const body = 'const office = "' + 'hello'.repeat(1000) + '";';
  const filename = 'index-a1B2c3D4.js';
  await Promise.all([
    writeFile(join(assets, filename), body),
    writeFile(join(assets, filename + '.br'), brotliCompressSync(body)),
    writeFile(join(assets, filename + '.gz'), gzipSync(body)),
    writeFile(join(root, 'private.js'), 'PRIVATE'),
    writeFile(join(root, 'private.js.br'), brotliCompressSync('PRIVATE')),
  ]);
  const app = express();
  app.use(precompressedAssets(directory));
  app.use(
    express.static(directory, {
      setHeaders(res, path) {
        res.setHeader('Cache-Control', assetCacheControl(path));
      },
    }),
  );
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const encoding of ['br', 'gzip', 'identity']) {
      const response = await fetch(`${base}/assets/${filename}?v=1`, {
        headers: { 'Accept-Encoding': encoding },
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type')!, /javascript/);
      assert.equal(
        response.headers.get('content-encoding'),
        encoding === 'identity' ? null : encoding,
      );
      assert.equal(await response.text(), body);
      assert.match(response.headers.get('vary')!, /Accept-Encoding/);
      assert.match(response.headers.get('cache-control')!, /immutable/);
    }
    const range = await fetch(`${base}/assets/${filename}`, {
      headers: { range: 'bytes=0-4', 'Accept-Encoding': 'br' },
    });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-encoding'), null);
    assert.equal(await range.text(), 'const');
    const escaped = await fetch(base + '/assets/%2e%2e/%2e%2e/private.js', {
      headers: { 'Accept-Encoding': 'br' },
    });
    assert.equal(escaped.status, 404);
    assert.ok(!(await escaped.text()).includes('PRIVATE'));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    assert.ok(root.startsWith(join(tmpdir(), 'office-static-')));
    await rm(root, { recursive: true });
  }
});
