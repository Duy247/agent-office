import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OfficeStore } from '../src/state.ts';
function ready() {
  const s = new OfficeStore({ characters: { a: 0 } });
  s.roster([
    { id: 'a', name: 'Alex', provider: 'opencode', model: 'example', title: 'Builder' },
    { id: 'b', name: 'Bea' },
  ]);
  s.layout({ sections: [{ id: 'g', name: 'Studio' }], agentAssignments: { a: 'g' } });
  s.event({ type: 'runtime-snapshot', snapshot: { activeTurns: [], attentionComplete: true } });
  s.connection('connected', 'Live', '0.64.0');
  return s;
}
const agent = (s: OfficeStore) => s.snapshot().agents[0];
test('new agents get unused characters and retain them across reorder, removal and restart', () => {
  const roster = [
    { id: 'a', name: 'Alex' },
    { id: 'i', name: 'Luke' },
    { id: 'q', name: 'Flora' },
  ];
  // These IDs collide under the old modulo-eight assignment.
  const first = new OfficeStore();
  first.roster(roster);
  const assignments = Object.fromEntries(first.snapshot().agents.map((a) => [a.id, a.character]));
  assert.equal(new Set(Object.values(assignments)).size, 3);
  first.roster([...roster].reverse());
  for (const a of first.snapshot().agents) assert.equal(a.character, assignments[a.id]);
  const restarted = new OfficeStore(structuredClone(first.config));
  restarted.roster([roster[2], roster[0]]);
  restarted.roster(roster);
  for (const a of restarted.snapshot().agents) assert.equal(a.character, assignments[a.id]);
});
test('main and side thread turns remain working until every turn finishes; duplicates are idempotent', () => {
  const s = ready();
  const e = { type: 'turn-started', botId: 'a', turnId: 'main' };
  s.event(e);
  s.event(e);
  s.event({ ...e, turnId: 'side', threadId: 'side' });
  s.event({ type: 'turn-completed', botId: 'a', turnId: 'main', status: 'completed' });
  assert.equal(agent(s).state, 'working');
  s.event({ type: 'turn-completed', botId: 'a', turnId: 'side', status: 'completed' });
  assert.equal(agent(s).state, 'idle');
});
test('attention variants, resolution, failure and queue are distinct', () => {
  const s = ready();
  s.event({
    type: 'queue-changed',
    snapshot: {
      botId: 'a',
      deliveries: [{ status: 'queued', text: 'PRIVATE' }, { status: 'completed' }],
    },
  });
  assert.equal(agent(s).state, 'queued');
  assert.equal(agent(s).queueCount, 1);
  for (const [type, kind] of [
    ['prompt', 'question'],
    ['approval', 'approval'],
    ['browser-takeover-requested', 'takeover'],
  ]) {
    const p = { botId: 'a', requestId: 'r', questions: ['PRIVATE'], command: 'PRIVATE' };
    s.event(
      type === 'prompt'
        ? { type, ...p }
        : type === 'approval'
          ? { type, approval: p }
          : { type, request: p },
    );
    assert.equal(agent(s).state, kind);
    s.event({ type: 'agent-input-resolved', botId: 'a', requestId: 'r' });
    assert.equal(agent(s).state, 'queued');
  }
  s.event({ type: 'turn-completed', botId: 'a', turnId: 'x', status: 'failed' });
  assert.equal(agent(s).state, 'failed');
  s.event({ type: 'turn-started', botId: 'a', turnId: 'next' });
  assert.equal(agent(s).state, 'working');
  assert.equal(JSON.stringify(s.snapshot()).includes('PRIVATE'), false);
});
test('task snapshots include running side threads and queued messages, discard titles and progress', () => {
  const s = ready();
  s.event({
    type: 'agent-tasks-changed',
    snapshot: {
      agentId: 'a',
      tasks: [
        {
          state: 'running',
          threadId: 'side',
          title: 'PRIVATE',
          progress: 'PRIVATE',
          queuedMessages: [{ text: 'PRIVATE' }],
        },
        { state: 'queued' },
      ],
    },
  });
  assert.equal(agent(s).state, 'working');
  assert.equal(agent(s).queueCount, 2);
  assert.equal(JSON.stringify(s.snapshot()).includes('PRIVATE'), false);
  s.event({
    type: 'agent-tasks-changed',
    snapshot: { agentId: 'a', tasks: [{ state: 'idle', outcome: 'failed' }] },
  });
  assert.equal(agent(s).state, 'failed');
});
test('snapshots resynchronize after reconnect; incomplete attention does not clear pending prompts', () => {
  const s = ready();
  s.event({ type: 'prompt', botId: 'a', requestId: 'r' });
  s.event({ type: 'runtime-snapshot', snapshot: { activeTurns: [], attentionComplete: false } });
  assert.equal(agent(s).state, 'question');
  s.connection('disconnected', 'stale');
  assert.equal(agent(s).state, 'question');
  assert.equal(s.snapshot().connection, 'disconnected');
  s.resetRuntime();
  s.event({
    type: 'runtime-snapshot',
    snapshot: { activeTurns: [{ botId: 'a', turnId: 'new' }], attentionComplete: true },
  });
  s.connection('connected', 'Live');
  assert.equal(agent(s).state, 'working');
});
test('agent removal, group changes, persistent character zero and desk slots', () => {
  const s = ready();
  const original = agent(s);
  assert.equal(original.character, 0);
  s.roster([
    { id: 'b', name: 'Bea' },
    { id: 'a', name: 'Alex' },
  ]);
  s.layout({ sections: [{ id: 'g', name: 'Studio' }], agentAssignments: { a: 'g' } });
  assert.equal(s.snapshot().agents[1].deskIndex, original.deskIndex);
  s.roster([{ id: 'a', name: 'Alex' }]);
  s.layout({ sections: [{ id: 'new', name: 'New team' }], agentAssignments: { a: 'new' } });
  assert.equal(agent(s).groupId, 'new');
  assert.equal(s.snapshot().agents.length, 1);
  s.roster([]);
  assert.equal(s.snapshot().agents.length, 0);
});
test('raw conversation, activity text, payload extras and credentials never leave the state boundary', () => {
  const s = ready();
  s.roster([
    {
      id: 'a',
      name: 'Alex',
      sessionToken: 'PRIVATE',
      messages: ['PRIVATE'],
      providerSettings: { token: 'PRIVATE' },
    },
  ]);
  s.event({
    type: 'runtime-snapshot',
    snapshot: {
      activeTurns: [{ botId: 'a', turnId: 'x' }],
      work: [{ text: 'PRIVATE' }],
      latestMessages: [{ text: 'PRIVATE' }],
      pendingPrompts: [{ botId: 'a', requestId: 'r', questions: ['PRIVATE'] }],
    },
  });
  s.event({ type: 'conversation-delta', text: 'PRIVATE' });
  s.event({ type: 'turn-progress', botId: 'a', detail: 'PRIVATE' });
  assert.equal(JSON.stringify(s.snapshot()).includes('PRIVATE'), false);
  assert.equal(agent(s).activity, 'Waiting for your answer');
  s.connection('sign-in-required', 'Sign in');
  assert.equal(s.snapshot().connection, 'sign-in-required');
});
