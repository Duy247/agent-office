import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
// Explicit live suite; start npm start, then OFFICE_LIVE_TEST=1 npm test.
const live = process.env.OFFICE_LIVE_TEST === '1';
test(
  'live browser boundary is filtered and rejects writes and foreign origins',
  { skip: !live },
  async () => {
    const base = 'http://127.0.0.1:4318';
    const response = await fetch(base + '/api/state');
    assert.equal(response.status, 200);
    const catalog = await (await fetch(base + '/api/servers')).json();
    assert.equal(catalog.defaultId, 'default');
    assert.ok(catalog.servers.length > 0);
    for (const server of catalog.servers)
      assert.deepEqual(Object.keys(server).sort(), ['id', 'name']);
    assert.equal((await fetch(base + '/api/state?server=not-configured')).status, 404);
    assert.equal((await fetch(base + '/api/events?server=not-configured')).status, 404);
    assert.equal((await fetch(base + '/api/state?server=a&server=b')).status, 400);
    assert.equal((await fetch(base + '/api/servers', { method: 'POST' })).status, 405);
    const state = await response.json();
    assert.ok(Array.isArray(state.agents));
    const allowed = [
      'id',
      'name',
      'title',
      'provider',
      'model',
      'groupId',
      'deskIndex',
      'state',
      'queueCount',
      'activity',
      'updatedAt',
      'character',
      'desk',
    ];
    for (const agent of state.agents)
      assert.ok(Object.keys(agent).every((k) => allowed.includes(k)));
    for (const field of [
      'sessionToken',
      'authorization',
      'latestMessages',
      'providerSettings',
      'questions',
      'password',
      'conversation',
    ])
      assert.equal(JSON.stringify(state).includes('"' + field + '"'), false);
    assert.equal((await fetch(base + '/api/state', { method: 'POST' })).status, 405);
    assert.equal(
      (await fetch(base + '/api/state', { headers: { Origin: 'https://foreign.example' } })).status,
      403,
    );
    const foreign = await new Promise<number | undefined>((resolve, reject) => {
      get(base + '/api/state', { headers: { Host: 'foreign.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', reject);
    });
    assert.equal(foreign, 403);
    const stream = await fetch(base + '/api/events');
    assert.ok(stream.headers.get('content-type')?.includes('text/event-stream'));
    await stream.body?.cancel();
  },
);
