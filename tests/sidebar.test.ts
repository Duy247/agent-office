import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicSnapshot } from '../src/boundary.ts';
import {
  activityText,
  agentChannels,
  agentGroup,
  clock,
  matchesFilter,
  sortedAgents,
} from '../ui/sidebar-model.ts';

const snapshot = publicSnapshot({
  agents: [
    'idle',
    'working',
    'queued',
    'question',
    'approval',
    'takeover',
    'failed',
    'unknown',
  ].map((state, i) => ({
    id: String(i),
    name: String(i),
    state,
    groupId: 'g',
    queueCount: state === 'queued' ? 4 : 0,
  })),
  groups: [{ id: 'g', name: 'Studio' }],
  channels: [{ id: 'c', name: 'Planning', agentIds: ['0', '1'], active: true }],
});

test('team filters distinguish working, queued, attention, idle and unknown states', () => {
  const count = (filter: Parameters<typeof matchesFilter>[1]) =>
    snapshot.agents.filter((a) => matchesFilter(a, filter)).length;
  assert.equal(count('all'), 8);
  assert.equal(count('working'), 1);
  assert.equal(count('attention'), 4);
  assert.equal(count('idle'), 1);
  assert.equal(snapshot.agents[2].queueCount, 4);
});
test('attention comes first without mutating the connector roster', () => {
  const before = snapshot.agents.map((a) => a.id);
  assert.deepEqual(
    sortedAgents(snapshot.agents).map((a) => a.state),
    ['question', 'approval', 'takeover', 'failed', 'working', 'queued', 'idle', 'unknown'],
  );
  assert.deepEqual(
    snapshot.agents.map((a) => a.id),
    before,
  );
});
test('activity and timestamps have honest fallbacks', () => {
  assert.equal(activityText({ ...snapshot.agents[1], activity: '' }), 'Working');
  assert.equal(
    activityText({ ...snapshot.agents[1], activity: 'Work reported by connector' }),
    'Work reported by connector',
  );
  assert.equal(clock(null), 'Not reported');
  assert.equal(clock('invalid'), 'Not reported');
});
test('channel membership and office areas follow the current snapshot', () => {
  assert.equal(agentGroup(snapshot.agents[0], snapshot), 'Studio');
  assert.equal(agentGroup({ ...snapshot.agents[0], groupId: '' }, snapshot), 'Shared office');
  assert.equal(agentChannels(snapshot.agents[0], snapshot)[0].name, 'Planning');
  assert.deepEqual(agentChannels(snapshot.agents[2], snapshot), []);
  assert.deepEqual(agentChannels(snapshot.agents[0], { ...snapshot, channels: [] }), []);
});
