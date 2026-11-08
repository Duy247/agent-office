import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnector, connectors } from '../src/connectors/index.ts';
import { publicSnapshot } from '../src/boundary.ts';
import { mergeConfig, readSettings } from '../src/config.ts';
import { profileName } from '../src/session-store.ts';
import { teamEndpoint } from '../src/protocol.ts';
import { createServer } from 'node:http';
import { discover, request } from '../src/probe.ts';
import { jsonFileConnector } from '../src/connectors/json-file.ts';

test('a fresh clone defaults to demo without personal IDs or an Openbot connection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-office-config-'));
  try {
    await writeFile(
      join(root, 'office.config.json'),
      JSON.stringify({ port: 4318, connector: { type: 'demo' }, characters: {}, deskSlots: {} }),
    );
    const config = await readSettings(root, false);
    assert.equal(config.connector.type, 'demo');
    assert.deepEqual(config.characters, {});
    assert.equal(
      mergeConfig(
        { connector: { options: { profile: 'a' } } },
        { connector: { options: { baseUrl: 'https://example.com' } } },
      ).connector.options.profile,
      'a',
    );
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'agent-office-config-')));
    await rm(root, { recursive: true });
  }
});
test('demo is explicitly labelled, has usable normalized agents, and stops on cancellation', async () => {
  const controller = new AbortController();
  let count = 0;
  await createConnector('demo').start({
    signal: controller.signal,
    config: {},
    saveAppearance: async () => {},
    emit(raw) {
      const snapshot = publicSnapshot(raw);
      assert.equal(snapshot.source?.mode, 'demo');
      assert.ok(snapshot.agents.length > 0);
      count++;
      controller.abort();
    },
  });
  assert.equal(count, 1);
});
test('a third-party adapter can register without changing the server or office renderer', async () => {
  const controller = new AbortController();
  let emitted = false;
  connectors['test-adapter'] = () => ({
    async start(ctx) {
      ctx.emit(
        publicSnapshot({
          connection: 'connected',
          agents: [],
          groups: [],
          message: 'Custom source',
        }),
      );
    },
  });
  try {
    await createConnector('test-adapter').start({
      signal: controller.signal,
      config: {},
      saveAppearance: async () => {},
      emit() {
        emitted = true;
      },
    });
    assert.ok(emitted);
    assert.throws(() => createConnector('missing'));
  } finally {
    delete connectors['test-adapter'];
  }
});
test('all connector outputs cross a whitelist that strips credentials, chat and raw extra fields', () => {
  const result = publicSnapshot({
    connection: 'connected',
    sessionToken: 'PRIVATE',
    conversation: ['PRIVATE'],
    raw: { token: 'PRIVATE' },
    agents: [
      {
        id: 'a',
        name: 'Agent',
        state: 'working',
        queueCount: 1,
        password: 'PRIVATE',
        providerSettings: { token: 'PRIVATE' },
        messages: ['PRIVATE'],
      },
    ],
    groups: [],
    source: { id: 'custom', label: 'Custom', mode: 'live', token: 'PRIVATE' },
  });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(result.agents[0].state, 'working');
});
test('Openbot supports configured HTTPS servers and isolated credential profile names', () => {
  assert.equal(teamEndpoint('https://openbot.example.com'), 'https://openbot.example.com');
  assert.equal(teamEndpoint('http://localhost:9000'), 'http://localhost:9000');
  for (const url of [
    'http://remote.example.com',
    'https://user:pass@example.com',
    'https://example.com/path',
  ])
    assert.throws(() => teamEndpoint(url));
  assert.equal(profileName('work-server'), 'work-server');
  for (const p of ['../secret', 'a/b', 'a\\b', '']) assert.throws(() => profileName(p));
});
test('an explicitly configured Team API negotiates without process discovery and rejects the wrong identity', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url === '/v1/identity'
          ? { serverId: 'test-server', fingerprint: 'test-fingerprint' }
          : {
              appVersion: '0.64.0',
              protocol: { minimum: 1, maximum: 9 },
              capabilities: ['sidebar-layout', 'agent-runtime-snapshots'],
            },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number },
    options = { baseUrl: `http://127.0.0.1:${address.port}` };
  try {
    const host = await discover(
      { serverId: 'test-server', fingerprint: 'test-fingerprint' },
      options,
    );
    assert.equal(host.identity.serverId, 'test-server');
    await assert.rejects(
      () => discover({ serverId: 'other', fingerprint: 'wrong' }, options),
      /identity/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('simultaneous servers keep negotiated protocol and authentication isolated', async () => {
  const servers = [7, 9].map((version) =>
    createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/v1/compatibility') {
        res.end(
          JSON.stringify({
            protocol: { minimum: version, maximum: version },
            capabilities: ['sidebar-layout', 'agent-runtime-snapshots'],
          }),
        );
      } else if (req.url === '/v1/identity') {
        assert.equal(req.headers['openbot-protocol-version'], String(version));
        res.end(JSON.stringify({ serverId: 'server-' + version, fingerprint: 'fp-' + version }));
      } else {
        assert.equal(req.method, 'GET');
        assert.equal(req.url, '/v1/agents');
        assert.equal(req.headers['openbot-protocol-version'], String(version));
        assert.equal(req.headers.authorization, 'Bearer test-token-' + version);
        res.end(JSON.stringify([]));
      }
    }),
  );
  try {
    await Promise.all(
      servers.map((s) => new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve))),
    );
    const hosts = await Promise.all(
      servers.map((s) =>
        discover(undefined, {
          baseUrl: `http://127.0.0.1:${(s.address() as { port: number }).port}`,
        }),
      ),
    );
    await Promise.all(
      hosts.map((h) =>
        request(h.base, '/v1/agents', 'test-token-' + h.protocol, undefined, false, h.protocol),
      ),
    );
    assert.deepEqual(
      hosts.map((h) => h.protocol),
      [7, 9],
    );
  } finally {
    await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  }
});

test('account sign-in errors show only a fixed membership hint and never raw response details', async () => {
  let known = true;
  const server = createServer((_req, res) => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: known ? 'This OpenBot account is not a member of the team.' : 'PRIVATE ERROR',
        sessionToken: 'PRIVATE TOKEN',
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await assert.rejects(
      () => request(base, '/v1/auth/account', undefined, { accountTicket: 'test-ticket' }, true),
      (e: Error) => e.message.includes('not a member') && !e.message.includes('PRIVATE'),
    );
    known = false;
    await assert.rejects(
      () => request(base, '/v1/auth/account', undefined, { accountTicket: 'test-ticket' }, true),
      (e: Error) => e.message.endsWith('HTTP 400.') && !e.message.includes('PRIVATE'),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('JSON file feed preserves known state after malformed input and cancels cleanly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-office-feed-')),
    path = join(root, 'status.json');
  await writeFile(
    path,
    JSON.stringify({ agents: [{ id: 'a', name: 'File agent', state: 'working' }], groups: [] }),
  );
  const controller = new AbortController();
  let count = 0;
  try {
    await jsonFileConnector({ path }).start({
      signal: controller.signal,
      config: {},
      saveAppearance: async () => {},
      emit(snapshot) {
        count++;
        if (count === 1) void writeFile(path, 'invalid');
        else {
          assert.equal(snapshot.connection, 'disconnected');
          assert.equal(snapshot.agents[0].state, 'working');
          controller.abort();
        }
      },
    });
    assert.equal(count, 2);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'agent-office-feed-')));
    await rm(root, { recursive: true });
  }
});
