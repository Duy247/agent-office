import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridCell, planRooms } from '../ui/layout.ts';
import type { OfficeAgent } from '../src/state.ts';
const agent = (i: number, groupId = 'g'): OfficeAgent => ({
  id: 'agent-' + groupId + i,
  name: 'Agent ' + i,
  title: '',
  provider: '',
  model: '',
  groupId,
  deskIndex: i,
  character: i % 8,
  state: 'idle',
  queueCount: 0,
  activity: 'Available',
  updatedAt: null,
});
test('growing to 50 agents reserves a distinct desk and lounge seat without moving earlier desks', () => {
  const small = planRooms({
    groups: [{ id: 'g', name: 'Team' }],
    agents: Array.from({ length: 3 }, (_, i) => agent(i)),
  })[0];
  for (const count of [12, 24, 50]) {
    const big = planRooms({
      groups: [{ id: 'g', name: 'Team' }],
      agents: Array.from({ length: count }, (_, i) => agent(i)),
    })[0];
    assert.ok(big.width > small.width || big.depth > small.depth);
    assert.equal(big.desks.size, count);
    assert.equal(big.seats.size, count);
    assert.equal(new Set([...big.desks.values()].map((p) => p.x + ',' + p.z)).size, count);
    assert.equal(new Set([...big.seats.values()].map((p) => p.x + ',' + p.z)).size, count);
    for (const [id, desk] of small.desks) assert.deepEqual(big.desks.get(id), desk);
    for (const d of big.desks.values()) {
      assert.ok(d.x - 0.81 > big.minX && d.x + 0.81 < big.maxX);
      assert.ok(d.z - 0.44 > big.minZ && d.z + 1.4 < big.maxZ);
    }
    for (const seat of big.seats.values())
      assert.ok(seat.x > big.minX && seat.x < big.maxX && seat.z > big.minZ && seat.z < big.maxZ);
    for (const desk of big.desks.values())
      assert.ok(
        desk.z + 1.4 < big.amenityZ - 1.5,
        'recreation strip stays clear of desks and chairs',
      );
    for (const couch of big.couches)
      assert.ok(
        couch.z + 2.3 < big.amenityZ - 1.5,
        'recreation strip stays clear of lounge tables',
      );
    for (const a of big.desks.values())
      for (const b of big.desks.values())
        if (a !== b) assert.ok(Math.abs(a.x - b.x) > 2.6 || Math.abs(a.z - b.z) > 2.4);
  }
});
test('rooms of different sizes never overlap, including a large room on a later row', () => {
  const groups = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    agents = groups.flatMap((g, j) =>
      Array.from({ length: [3, 24, 50][j] }, (_, i) => agent(i, g.id)),
    );
  const rooms = planRooms({ groups, agents });
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i],
        b = rooms[j],
        ax = a.offsetX + a.minX,
        az = a.offsetZ + a.minZ,
        bx = b.offsetX + b.minX,
        bz = b.offsetZ + b.minZ;
      assert.ok(
        ax + a.width <= bx || bx + b.width <= ax || az + a.depth <= bz || bz + b.depth <= az,
      );
    }
});
test('desk slots keep their coordinates when agents are removed or the roster is reordered', () => {
  const agents = Array.from({ length: 15 }, (_, i) => agent(i));
  const before = planRooms({ groups: [{ id: 'g', name: 'Team' }], agents })[0];
  const after = planRooms({
    groups: [{ id: 'g', name: 'Team' }],
    agents: agents.filter((_, i) => i % 2).reverse(),
  })[0];
  for (const a of after.agents) {
    assert.deepEqual(after.desks.get(a.id), before.desks.get(a.id));
    assert.deepEqual(after.seats.get(a.id), before.seats.get(a.id));
  }
  assert.deepEqual([0, 1, 2, 3].map(gridCell), [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: 1, z: 1 },
  ]);
});
