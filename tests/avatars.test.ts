import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publicAvatar, rosterAvatar, avatarKey } from '../src/avatar-metadata.ts';
import { renderAvatar, avatarProfile, validAvatarImage } from '../src/avatars.ts';
import { AvatarDownloads } from '../src/avatar-downloads.ts';
import { OfficeStore } from '../src/state.ts';
import { OfficeFeeds } from '../src/office-servers.ts';
import { publicSnapshot } from '../src/boundary.ts';
import { allowedRequest } from '../src/protocol.ts';

const avatar = { seed: 'example:face:0', hue: 150, color: '#123abc' };
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
test('avatar metadata permits only seed, hue, color and image version; source URLs and secrets stay private', () => {
  assert.deepEqual(
    publicAvatar({
      ...avatar,
      version: 'version-1',
      token: 'PRIVATE',
      url: 'https://foreign.example',
    }),
    { ...avatar, version: 'version-1' },
  );
  assert.equal(publicAvatar({ seed: '<script>' }), undefined);
  assert.deepEqual(
    publicAvatar({ seed: 'example', hue: 999, color: 'url(https://foreign.example)' }),
    { seed: 'example', hue: null },
  );
  const item = rosterAvatar({
    id: 'agent',
    avatarSeed: avatar.seed,
    avatarHue: 150,
    avatarUrl: 'openbot-avatar://agent/agent?v=version-1&type=image/png',
  });
  assert.equal(item!.version, 'version-1');
  assert.equal(
    rosterAvatar({
      id: 'agent',
      avatarSeed: avatar.seed,
      avatarUrl: 'https://foreign.example/?v=wrong',
    })!.version,
    undefined,
  );
  assert.equal(
    rosterAvatar({
      id: 'agent',
      avatarSeed: avatar.seed,
      avatarUrl: 'openbot-avatar://agent/other?v=wrong',
    })!.version,
    undefined,
  );
});
test('roster avatar edits replace the old image identity without changing the 3D character', () => {
  const store = new OfficeStore({ characters: {}, deskSlots: {} });
  store.roster([{ id: 'agent', avatarSeed: 'first:face:1', avatarHue: 30 }]);
  const before = store.snapshot().agents[0];
  store.roster([{ id: 'agent', avatarSeed: 'second:flat:2', avatarHue: 150 }]);
  const after = store.snapshot().agents[0];
  assert.equal(after.character, before.character);
  assert.notEqual(avatarKey(after.avatar!), avatarKey(before.avatar!));
  const clean = publicSnapshot({
    agents: [{ id: 'agent', avatar: { ...avatar, accountToken: 'PRIVATE' } }],
  });
  assert.equal(JSON.stringify(clean).includes('PRIVATE'), false);
});
test('generated native avatars are deterministic still SVGs with visible native geometry and no scripts', async () => {
  const [a, b, flat] = await Promise.all([
    renderAvatar(avatar),
    renderAvatar(avatar),
    renderAvatar({ ...avatar, seed: 'example:flat:0' }),
  ]);
  assert.deepEqual(a, b);
  const svg = a.bytes.toString();
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /<path[^>]+d="M/);
  assert.doesNotMatch(svg, /visibility="hidden"/);
  assert.doesNotMatch(svg, /<script|file:\/\/|\/__bloub__\/|\bonload=/);
  assert.equal(a.mimeType, 'image/svg+xml');
  assert.notEqual(a.bytes.toString(), flat.bytes.toString());
  assert.equal(avatarProfile(avatar).color, '#123abc');
});
test('image fetching policy is bounded and allows only read-only versioned avatar paths', () => {
  assert.ok(validAvatarImage({ bytes: png, mimeType: 'image/png' }));
  assert.equal(
    validAvatarImage({ bytes: Buffer.from('<svg onload="bad"/>'), mimeType: 'image/svg+xml' }),
    false,
  );
  assert.equal(
    validAvatarImage({ bytes: Buffer.alloc(3 * 1024 * 1024), mimeType: 'image/png' }),
    false,
  );
  assert.ok(allowedRequest('GET', '/v1/agents/agent/avatar?v=version-1'));
  for (const path of [
    '/v1/agents/agent/avatar?v=x&token=bad',
    '/v1/agents/../avatar?v=x',
    '/v1/agents/agent/avatar',
    'https://foreign.example/avatar?v=x',
  ])
    assert.equal(allowedRequest('GET', path), false);
  assert.equal(allowedRequest('PUT', '/v1/agents/agent/avatar?v=version-1'), false);
});
test('downloaded avatar chunks require an explicit request, matching size, MIME and SHA256', async () => {
  const downloads = new AvatarDownloads();
  const frame = {
    version: 2,
    type: 'file-open',
    transferId: 'image',
    size: png.length,
    mimeType: 'image/png',
    sha256: createHash('sha256').update(png).digest('hex'),
  };
  const sent: any[] = [],
    send = (f: any) => {
      sent.push(f);
    };
  assert.throws(() => downloads.receive(JSON.stringify(frame), false, send));
  assert.throws(() =>
    downloads.receive(JSON.stringify({ ...frame, size: 3 * 1024 * 1024 }), true, send),
  );
  downloads.receive(JSON.stringify(frame), true, send);
  const id = Buffer.from('image'),
    chunk = Buffer.alloc(10 + id.length + png.length);
  chunk[0] = 2;
  chunk[1] = id.length;
  id.copy(chunk, 2);
  chunk.writeBigUInt64BE(0n, 2 + id.length);
  png.copy(chunk, 10 + id.length);
  downloads.receive(chunk, true, send);
  const result = downloads.wait('image');
  downloads.receive(
    JSON.stringify({ version: 2, type: 'file-complete', transferId: 'image' }),
    true,
    send,
  );
  assert.deepEqual((await result).bytes, png);
  assert.equal(sent[0].receivedThrough, 0);
  assert.equal(sent[1].receivedThrough, png.length);
  downloads.receive(JSON.stringify({ ...frame, sha256: '0'.repeat(64) }), true, send);
  downloads.receive(chunk, true, send);
  assert.throws(() =>
    downloads.receive(
      JSON.stringify({ version: 2, type: 'file-complete', transferId: 'image' }),
      true,
      send,
    ),
  );
  downloads.clear();
});
test('avatar cache is server-specific, deduplicates image reads, and rejects removed or stale identities', async () => {
  let reads = 0;
  const pool = new OfficeFeeds(
    { connector: { type: 'test' }, servers: [{ id: 'other', options: { profile: 'other' } }] },
    () => ({
      async start(ctx) {
        ctx.emit(
          publicSnapshot({ agents: [{ id: 'same', avatar: { ...avatar, version: 'image-1' } }] }),
        );
      },
      async avatar() {
        reads++;
        return { bytes: png, mimeType: 'image/png' };
      },
    }),
    async () => {},
  );
  try {
    pool.subscribe('default', () => {});
    pool.subscribe('other', () => {});
    await new Promise((r) => setTimeout(r, 0));
    const revision = avatarKey({ ...avatar, version: 'image-1' });
    await Promise.all([
      pool.avatar('default', 'same', revision),
      pool.avatar('default', 'same', revision),
      pool.avatar('other', 'same', revision),
    ]);
    assert.equal(reads, 2);
    assert.equal(await pool.avatar('default', 'missing', revision), undefined);
    assert.equal(await pool.avatar('default', 'same', 'outdated'), undefined);
    assert.equal(await pool.avatar('missing', 'same', revision), undefined);
  } finally {
    pool.close();
  }
});
