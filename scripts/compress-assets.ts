import { readdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';
const brotli = promisify(brotliCompress),
  zip = promisify(gzip);
const root = new URL('../dist/', import.meta.url);
async function walk(directory: URL) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(
      encodeURIComponent(entry.name) + (entry.isDirectory() ? '/' : ''),
      directory,
    );
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!/\.(js|css|json|svg|html|obj|mtl)$/.test(entry.name)) continue;
    const input = await readFile(path);
    if (input.length < 1024) continue;
    const [br, gz] = await Promise.all([
      brotli(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }),
      zip(input, { level: 9 }),
    ]);
    if (br.length < input.length) await writeFile(new URL(path.href + '.br'), br);
    if (gz.length < input.length) await writeFile(new URL(path.href + '.gz'), gz);
  }
}
await walk(root);
console.log('Prepared Brotli and gzip assets for local and reverse-proxy delivery.');
