import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  OfficeFeeds,
  publicServers,
  serverConfig,
  serverDefinitions,
} from '../src/office-servers.ts';
import { publicSnapshot } from '../src/boundary.ts';
import type { ConnectorContext } from '../src/connectors/types.ts';
import { mergeConfig, updateLocalConfig } from '../src/config.ts';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const config = () => ({
  connector: { type: 'openbot', options: { profile: 'default' } },
  characters: { shared: 1 },
  deskSlots: { shared: { groupId: 'first', index: 0 } },
  servers: [
    {
      id: 'second',
      name: 'Second office',
      options: { profile: 'second', baseUrl: 'https://second.example.com' },
    },
  ],
});
test('server catalog preserves legacy connection and exposes only IDs and display names', () => {
  const definitions = serverDefinitions(config());
  assert.deepEqual(publicServers(definitions), [
    { id: 'default', name: 'Openbot' },
    { id: 'second', name: 'Second office' },
  ]);
  assert.equal(definitions[1].options.profile, 'second');
  assert.equal(JSON.stringify(publicServers(definitions)).includes('https:'), false);
});
test('server configuration rejects duplicate IDs/profiles, unsafe endpoints and reserved keys', () => {
  for (const id of ['default', '../bad', '__proto__', 'constructor'])
    assert.throws(() =>
      serverDefinitions({ ...config(), servers: [{ id, options: { profile: 'second' } }] }),
    );
  for (const options of [
    {},
    { profile: 'default' },
    { profile: '../bad' },
    { profile: 'second', baseUrl: 'http://remote.example.com' },
  ])
    assert.throws(() => serverDefinitions({ ...config(), servers: [{ id: 'second', options }] }));
  assert.throws(() => serverDefinitions({ ...config(), servers: Array(16).fill({}) }));
});
test('appearance is isolated even when servers have identical agent IDs', () => {
  const saved = {
    ...config(),
    serverAppearance: { second: { characters: { shared: 7 }, deskSlots: {} } },
  };
  const first = serverConfig(saved, 'default'),
    second = serverConfig(saved, 'second');
  assert.equal(first.characters.shared, 1);
  assert.equal(second.characters.shared, 7);
  second.characters.shared = 3;
  assert.equal(saved.serverAppearance.second.characters.shared, 7);
  assert.deepEqual(serverConfig(config(), 'second').characters, {});
});
test('viewers share one feed per server while different servers never mix snapshots or credentials', async () => {
  const contexts = new Map<string, ConnectorContext>();
  const saves: any[] = [];
  const pool = new OfficeFeeds(
    config(),
    (_type, options) => ({
      async start(ctx) {
        contexts.set(String(options.profile), ctx);
        ctx.emit(
          publicSnapshot({
            connection: 'connected',
            agents: [
              { id: 'shared', name: options.profile, state: 'working', sessionToken: 'PRIVATE' },
            ],
          }),
        );
      },
    }),
    async (patch) => {
      saves.push(patch);
    },
  );
  try {
    const a: string[] = [],
      b: string[] = [],
      c: string[] = [];
    pool.subscribe('default', (wire) => a.push(wire));
    pool.subscribe('second', (wire) => b.push(wire));
    pool.subscribe('default', (wire) => c.push(wire));
    await delay(0);
    assert.equal(contexts.size, 2);
    assert.equal(JSON.parse(a.at(-1)!).agents[0].name, 'default');
    assert.equal(JSON.parse(b.at(-1)!).agents[0].name, 'second');
    assert.deepEqual(a, c);
    assert.equal(a.join('').includes('PRIVATE'), false);
    const old = a.length;
    contexts.get('second')!.emit(publicSnapshot({ connection: 'sign-in-required' }));
    assert.equal(a.length, old);
    assert.equal(JSON.parse(b.at(-1)!).connection, 'sign-in-required');
    await contexts.get('second')!.saveAppearance({ characters: { shared: 6 } });
    assert.deepEqual(saves[0], { serverAppearance: { second: { characters: { shared: 6 } } } });
    assert.equal(pool.snapshot('unconfigured'), undefined);
    assert.equal(
      pool.subscribe('unconfigured', () => {}),
      undefined,
    );
  } finally {
    pool.close();
  }
});
test('unviewed feeds stop and resynchronize; late events from aborted feeds are ignored', async () => {
  const contexts: ConnectorContext[] = [];
  const pool = new OfficeFeeds(
    config(),
    () => ({
      async start(ctx) {
        contexts.push(ctx);
      },
    }),
    async () => {},
    10,
  );
  try {
    const off = pool.subscribe('default', () => {})!;
    await delay(0);
    contexts[0].emit(
      publicSnapshot({ connection: 'connected', agents: [{ id: 'a', name: 'Old roster' }] }),
    );
    off();
    await delay(25);
    assert.equal(contexts[0].signal.aborted, true);
    const wires: string[] = [];
    pool.subscribe('default', (s) => wires.push(s));
    await delay(0);
    contexts[0].emit(
      publicSnapshot({ connection: 'connected', agents: [{ id: 'bad', name: 'Late roster' }] }),
    );
    assert.equal(wires.join('').includes('Late roster'), false);
    contexts[1].emit(
      publicSnapshot({ connection: 'connected', agents: [{ id: 'new', name: 'Fresh roster' }] }),
    );
    assert.equal(JSON.parse(wires.at(-1)!).agents[0].name, 'Fresh roster');
  } finally {
    pool.close();
  }
});
test('failed feeds retain their own state and cannot stop another server', async () => {
  const pool = new OfficeFeeds(
    config(),
    (_type, options) => ({
      async start(ctx) {
        ctx.emit(
          publicSnapshot({
            connection: 'connected',
            agents: [{ id: 'same', name: options.profile }],
          }),
        );
        if (options.profile === 'second') throw new Error('PRIVATE ERROR');
      },
    }),
    async () => {},
  );
  try {
    pool.subscribe('default', () => {});
    pool.subscribe('second', () => {});
    await delay(0);
    assert.equal(JSON.parse(pool.snapshot('default')!).connection, 'connected');
    const failed = JSON.parse(pool.snapshot('second')!);
    assert.equal(failed.connection, 'disconnected');
    assert.equal(failed.agents[0].name, 'second');
    assert.equal(JSON.stringify(failed).includes('PRIVATE ERROR'), false);
  } finally {
    pool.close();
  }
});
test('concurrent appearance saves preserve each server and unrelated local settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'office-server-settings-'));
  try {
    await updateLocalConfig({ boss: { name: 'Test owner' } }, root);
    await Promise.all([
      updateLocalConfig({ serverAppearance: { first: { characters: { same: 1 } } } }, root),
      updateLocalConfig({ serverAppearance: { second: { characters: { same: 7 } } } }, root),
    ]);
    const saved = JSON.parse(await readFile(join(root, 'office.config.local.json'), 'utf8'));
    assert.equal(saved.boss.name, 'Test owner');
    assert.equal(saved.serverAppearance.first.characters.same, 1);
    assert.equal(saved.serverAppearance.second.characters.same, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
