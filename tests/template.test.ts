import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { collectTemplate } from '../scripts/package-template.ts';
test('shareable template includes code and models but excludes local identities, sessions and screenshots', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url)),
    files = await collectTemplate(root),
    names = Object.keys(files);
  for (const path of [
    'office/office.ts',
    'office/sdk.ts',
    'public/assets/custom/sample-column.glb',
    'src/connectors/index.ts',
    'package-lock.json',
    'README.md',
  ])
    assert.ok(files[path], path);
  assert.equal(
    names.some((n) =>
      /\.local\.|\.dpapi|connection-proof|^office-.*\.png|node_modules|release\/|^public\/assets\/local\//.test(
        n,
      ),
    ),
    false,
  );
  const config = JSON.parse(new TextDecoder().decode(files['office.config.json']));
  assert.equal(config.connector.type, 'demo');
  assert.deepEqual(config.characters, {});
  assert.deepEqual(config.deskSlots, {});
});
