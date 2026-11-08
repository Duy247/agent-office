import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRooms } from '../ui/layout.ts';
import {
  ActivityDirector,
  campusLeisureSpots,
  meetingAssignments,
  ambientBubble,
} from '../office/activities.ts';
import { CampusNavigation, CampusRouter, withCampusLinks } from '../office/navigation.ts';
import { OfficeStore } from '../src/state.ts';
import { publicSnapshot } from '../src/boundary.ts';
import { allowedRequest } from '../src/protocol.ts';
import type { OfficeSnapshot } from '../src/shared.ts';
import * as THREE from 'three';
import { Builder } from '../office/sdk.ts';
import { buildPark } from '../office/presets/park.ts';
import { disposeObject } from '../ui/characters.ts';

function fixture(count = 3): OfficeSnapshot {
  return publicSnapshot({
    connection: 'connected',
    groups: [{ id: 'g', name: 'Studio' }],
    agents: Array.from({ length: count }, (_, i) => ({
      id: `a${i}`,
      name: `Agent ${i}`,
      groupId: 'g',
      deskIndex: i,
      state: 'idle',
      activity: 'Available',
      character: i % 8,
    })),
    config: {},
  });
}
test('idle visits cover park and entertainment, remain unique, and stop for work or stale/reduced motion', () => {
  const s = fixture(),
    plans = planRooms(s),
    d = new ActivityDirector();
  d.update(s, plans, 0, true);
  const visited = new Set<string>();
  for (let t = 0; t < 700; t++) {
    const goals = d.update(s, plans, 1);
    assert.equal(new Set([...goals.values()].map((g) => g.roomId + g.id)).size, 3);
    for (const g of goals.values()) visited.add(g.id.split('-').slice(0, 2).join('-'));
  }
  assert.ok([...visited].some((v) => v.startsWith('park')));
  assert.ok(
    [...visited].some(
      (v) => v.startsWith('cafe') || v.startsWith('arcade') || v.startsWith('tennis'),
    ),
  );
  const before = structuredClone([...d.goals]);
  s.connection = 'disconnected';
  d.update(s, plans, 200, true);
  assert.deepEqual([...d.goals], before);
  s.connection = 'connected';
  s.config.reducedMotion = true;
  d.update(s, plans, 0, true);
  const paused = structuredClone([...d.goals]);
  d.update(s, plans, 200);
  assert.deepEqual([...d.goals], paused);
  s.agents[0].state = 'working';
  d.update(s, plans, 0, true);
  assert.equal(d.goals.get('a0')?.kind, 'desk');
});
test('a fresh office immediately sends idle agents to different leisure zones without waiting for animation time', () => {
  for (const reducedMotion of [false, true]) {
    const s = fixture();
    s.config.reducedMotion = reducedMotion;
    const d = new ActivityDirector(),
      goals = d.update(s, planRooms(s), 0, true);
    assert.ok([...goals.values()].every((g) => g.kind === 'leisure'));
    assert.equal(new Set([...goals.values()].map((g) => g.id.split('-')[0])).size, 3);
  }
});
test('active shared channels reserve unique conference seats, override leisure, and release on completion', () => {
  const s = fixture(8);
  s.channels = [
    { id: 'falcon', name: 'Project Falcon', agentIds: s.agents.map((a) => a.id), active: false },
  ];
  const plans = planRooms(s),
    d = new ActivityDirector();
  assert.ok(plans[0].conference!.seats.length >= 8);
  d.update(s, plans, 0, true);
  assert.equal(d.meetings.size, 0);
  s.channels[0].active = true;
  d.update(s, plans, 0, true);
  assert.equal(d.meetings.get('g')?.name, 'Project Falcon');
  assert.ok([...d.goals.values()].every((g) => g.kind === 'meeting'));
  assert.equal(new Set([...d.goals.values()].map((g) => g.x + ',' + g.z)).size, 8);
  s.channels[0].active = false;
  d.update(s, plans, 0, true);
  assert.equal(d.meetings.size, 0);
  assert.ok([...d.goals.values()].every((g) => g.kind !== 'meeting'));
});
test('entertainment and conference approach paths remain reachable without cutting through furniture', () => {
  const s = fixture();
  const p = planRooms(s)[0],
    nav = new CampusNavigation(p),
    origin = { x: -1.1, z: 0 };
  for (const spot of campusLeisureSpots(p).filter((s) => !s.id.startsWith('lounge'))) {
    const route = nav.path(origin, spot.approach ?? spot);
    assert.ok(route, spot.id);
    for (let i = 1; i < route.length; i++) assert.ok(nav.clear(route[i - 1], route[i]), spot.id);
  }
  for (const seat of p.conference!.seats) {
    const target = { x: seat.x + Math.sign(seat.x - p.conference!.x) * 0.3, z: seat.z };
    assert.ok(nav.path(origin, target), 'conference seat is reachable through doorway');
  }
});
test('cross-group meetings use a single host and floor bridges, with no conflicting bookings', () => {
  const s = fixture(4);
  s.groups.push({ id: 'other', name: 'Other' });
  s.agents[2].groupId = s.agents[3].groupId = 'other';
  s.channels = [
    { id: 'one', name: 'One', agentIds: s.agents.map((a) => a.id), active: true },
    { id: 'two', name: 'Two', agentIds: ['a0', 'a1'], active: true },
  ];
  const plans = withCampusLinks(planRooms(s));
  assert.ok(plans.some((p) => p.kind === 'circulation'));
  assert.equal(meetingAssignments(s, plans).size, 1);
  const host = plans[0],
    source = plans[1],
    router = new CampusRouter(plans),
    seat = host.conference!.seats[0];
  const route = router.route(
    { x: source.offsetX - 1.1, z: source.offsetZ },
    { x: host.offsetX + seat.x - 0.3, z: host.offsetZ + seat.z },
    host.id,
  );
  assert.ok(route);
  assert.ok(
    route.some((p) => p.x < 0),
    'uses exterior campus circulation',
  );
});
test('channel metadata uses reported work and channel threads, strips previews and keeps channel writes blocked', () => {
  const store = new OfficeStore();
  store.roster([{ id: 'a' }, { id: 'b' }]);
  store.channels([
    {
      id: 'c',
      name: 'Falcon',
      members: [{ agentId: 'a' }, { agentId: 'b' }],
      activeTasks: 0,
      openTasks: 0,
      threads: [{ agentId: 'a', threadId: 'channel-thread' }],
      instructions: 'PRIVATE',
      lastMessage: { text: 'SECRET' },
    },
  ]);
  store.event({ type: 'runtime-snapshot', snapshot: { activeTurns: [] } });
  assert.equal(store.snapshot().channels?.[0].active, false);
  store.event({ type: 'turn-started', agentId: 'a', turnId: 'direct', threadId: 'other-thread' });
  assert.equal(
    store.snapshot().channels?.[0].active,
    false,
    'unrelated private work is not a meeting',
  );
  store.event({ type: 'turn-started', agentId: 'a', turnId: 'shared', threadId: 'channel-thread' });
  assert.equal(store.snapshot().channels?.[0].active, true);
  store.event({ type: 'turn-completed', agentId: 'a', turnId: 'shared' });
  assert.equal(store.snapshot().channels?.[0].active, false);
  const out = publicSnapshot(store.snapshot());
  assert.ok(!JSON.stringify(out).includes('PRIVATE'));
  assert.ok(!JSON.stringify(out).includes('SECRET'));
  assert.ok(!JSON.stringify(out).includes('channel-thread'));
  assert.ok(allowedRequest('GET', '/v1/channels'));
  for (const path of ['/v1/channels/commands', '/v1/channels/read', '/v1/channels/delete'])
    assert.equal(allowedRequest('POST', path), false);
  store.channels([]);
  assert.deepEqual(store.snapshot().channels, []);
});
test('ambient bubbles are explicitly idle-only visual cues, absent during stale or actual work', () => {
  const s = fixture(),
    plans = planRooms(s),
    d = new ActivityDirector();
  d.update(s, plans, 0, true);
  const g = d.goals.get('a0');
  assert.equal(ambientBubble({ ...s.agents[0], state: 'working' }, g, 0, false, 'connected'), null);
  assert.equal(ambientBubble(s.agents[0], g, 0, false, 'disconnected'), null);
  assert.ok(
    Array.from({ length: 20 }, (_, t) => ambientBubble(s.agents[0], g, t, false, 'connected')).some(
      Boolean,
    ),
  );
});
test('a populated park builds with unique object IDs and idle reservations scale to 50 agents', () => {
  const snapshot = fixture(50),
    plan = planRooms(snapshot)[0],
    room = new THREE.Group();
  const assets = { instantiate: () => new THREE.Group(), has: () => true };
  const ctx = Object.assign(new Builder(room, assets), {
    plan,
    snapshot,
    room,
    model: () => new THREE.Group(),
  });
  assert.doesNotThrow(() => buildPark(ctx));
  assert.ok(ctx.objects.has('park-grass'));
  const d = new ActivityDirector();
  d.update(snapshot, [plan], 0, true);
  for (let i = 0; i < 100; i++) {
    const goals = d.update(snapshot, [plan], 2);
    assert.equal(new Set([...goals.values()].map((g) => g.roomId + ':' + g.id)).size, 50);
  }
  disposeObject(room);
});
test('archived channels, removed members, queued channel work and reconnect snapshots reconcile without text leakage', () => {
  const store = new OfficeStore();
  store.roster([{ id: 'a' }, { id: 'b' }]);
  const raw = {
    id: 'c',
    name: 'Channel',
    members: [{ agentId: 'a' }, { agentId: 'b' }],
    activeTasks: 0,
    openTasks: 1,
    lastMessage: { text: 'PRIVATE' },
  };
  store.channels([raw]);
  assert.equal(store.snapshot().channels?.[0].active, true);
  store.resetRuntime();
  store.event({ type: 'runtime-snapshot', snapshot: { activeTurns: [] } });
  store.channels([{ ...raw, openTasks: 0 }]);
  assert.equal(store.snapshot().channels?.[0].active, false);
  store.roster([{ id: 'a' }]);
  assert.deepEqual(store.snapshot().channels, []);
  store.roster([{ id: 'a' }, { id: 'b' }]);
  store.channels([{ ...raw, archived: true }]);
  assert.deepEqual(store.snapshot().channels, []);
  assert.deepEqual(
    publicSnapshot({
      ...store.snapshot(),
      channels: [
        {
          id: 'x',
          name: 'X',
          agentIds: ['a', 'a', 'hidden'],
          active: true,
          lastMessage: 'PRIVATE',
        },
      ],
    }).channels,
    [],
  );
});
