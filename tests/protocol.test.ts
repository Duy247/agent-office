import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localEndpoint,
  invitation,
  allowedRequest,
  negotiate,
  summarize,
  capabilities,
  sessionExpired,
} from '../src/protocol.ts';
test('expired and malformed sessions require sign-in; valid sessions remain usable', () => {
  const now = Date.parse('2026-11-07T00:00:00Z');
  for (const value of [undefined, 'invalid', '2026-11-06T00:00:00Z', '2026-11-07T00:00:00Z'])
    assert.equal(sessionExpired(value, now), true);
  assert.equal(sessionExpired('2026-11-08T00:00:00Z', now), false);
});
test('connector accepts only a loopback origin', () => {
  assert.equal(localEndpoint('http://127.0.0.1:65038'), 'http://127.0.0.1:65038');
  for (const u of [
    'http://evil.test:80',
    'http://127.0.0.1.evil.test:80',
    'http://user:pass@127.0.0.1:80',
    'http://127.0.0.1:80/path',
  ])
    assert.throws(() => localEndpoint(u));
});
test('reject Mobile Connect instead of consuming an account ticket', () => {
  assert.throws(() => invitation('openbot://mobile-connect?ticket=secret'), /Mobile Connect/);
  assert.throws(() => invitation('https://openbot.run/join?invite=wrong'));
});
test('work mutations are not allowed even during authentication', () => {
  for (const path of [
    '/v1/agents/a/messages',
    '/v1/agents/a/queue/cancel',
    '/v1/approvals/respond',
    '/v1/agents/a/settings',
  ]) {
    assert.equal(allowedRequest('POST', path), false);
    assert.equal(allowedRequest('POST', path, true), false);
  }
  assert.equal(allowedRequest('POST', '/v1/join'), false);
  assert.equal(allowedRequest('POST', '/v1/join', true), true);
});
test('negotiate compatible version and require data capabilities', () => {
  assert.equal(
    negotiate({
      protocol: { minimum: 1, maximum: 9 },
      capabilities: ['sidebar-layout', 'agent-runtime-snapshots'],
    }),
    9,
  );
  assert.throws(() => negotiate({ protocol: { minimum: 10, maximum: 11 }, capabilities: [] }));
  assert.throws(() => negotiate({ protocol: { minimum: 1, maximum: 9 }, capabilities: [] }));
});
test('diagnostic output never retains message text or secrets', () => {
  const raw = {
    type: 'runtime-snapshot',
    snapshot: {
      agents: [{ name: 'secret' }],
      activeTurns: [],
      work: [{ text: 'private request' }],
      latestMessages: [{ text: 'secret transcript' }],
      pendingPrompts: [{ questions: ['password'] }],
      pendingApprovals: [],
      pendingBrowserTakeovers: [],
      failedTurns: [],
    },
  };
  const safe = JSON.stringify(summarize(raw));
  for (const text of ['private', 'secret', 'password', 'transcript'])
    assert.equal(safe.includes(text), false);
  assert.equal(summarize({ type: 'conversation-delta', delta: 'private' }), null);
});
test('released Team API uses bots in runtime snapshots', () => {
  assert.equal(
    summarize({ type: 'runtime-snapshot', snapshot: { bots: [{ id: 'a' }, { id: 'b' }] } })?.agents,
    2,
  );
});
test('side task state is summarized without titles, progress, queue text, or errors', () => {
  assert.deepEqual(
    summarize({
      type: 'agent-tasks-changed',
      snapshot: {
        tasks: [
          { state: 'running', title: 'secret', progress: 'private' },
          { state: 'idle', outcome: 'completed', error: 'private' },
          { state: 'queued', queuedMessages: [{ text: 'private' }] },
        ],
      },
    }),
    { type: 'agent-tasks-changed', tasks: 3, running: 1, queued: 1, completed: 1 },
  );
  assert.equal(allowedRequest('POST', '/v1/agent-tasks/list'), true);
  assert.equal(allowedRequest('POST', '/v1/agent-tasks/start'), false);
});
test('event subscription declares the released provider-aware wire capability', () => {
  assert.ok(capabilities.includes('open-providers-v1'));
});
