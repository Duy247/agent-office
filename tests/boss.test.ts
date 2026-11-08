import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resolveBoss } from '../src/config.ts';
import { publicSnapshot } from '../src/boundary.ts';
import { planRooms } from '../ui/layout.ts';
import { withBossRoom, createBossPerson, bossPoseAt, updateBossRoom } from '../office/boss.ts';
import { disposeObject } from '../ui/characters.ts';

test('boss defaults to the profile folder name and male, with explicit overrides and opt-out', () => {
  assert.deepEqual(resolveBoss(undefined, 'C:\\Users\\TestOwner'), {
    name: 'TestOwner',
    gender: 'male',
  });
  assert.deepEqual(resolveBoss({ name: '  ', gender: 'invalid' }, '/home/example'), {
    name: 'example',
    gender: 'male',
  });
  assert.deepEqual(resolveBoss({ name: 'Alex', gender: 'female' }, '/home/example'), {
    name: 'Alex',
    gender: 'female',
  });
  assert.equal(resolveBoss({ enabled: false }, '/home/example'), undefined);
  const boss = resolveBoss({ name: 'A\nB', gender: 'female' }, '/home/example');
  const out = publicSnapshot({
    config: { boss: { ...boss, profilePath: 'private-path', token: 'secret' } },
  });
  assert.deepEqual(out.config.boss, { name: 'A B', gender: 'female' });
  assert.ok(!JSON.stringify(out).includes('private-path'));
});

test('one boss suite stays outside group rooms and never creates an Openbot agent', () => {
  const rooms = planRooms({
    groups: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    agents: [],
  });
  const suite = withBossRoom(rooms, { name: 'Owner', gender: 'male' });
  assert.equal(suite.length, rooms.length + 1);
  const boss = suite.at(-1)!;
  assert.equal(boss.kind, 'boss');
  assert.equal(boss.agents.length, 0);
  for (const room of rooms) {
    assert.ok(boss.offsetX + boss.maxX < room.offsetX + room.minX);
    assert.ok(suite.includes(room), 'existing office plans remain intact');
  }
  assert.equal(withBossRoom(rooms), rooms);
});

test('fashion models have distinct silhouettes and retain seated/standing floor alignment', () => {
  const male = createBossPerson('male'),
    female = createBossPerson('female');
  try {
    assert.ok(male.root.getObjectByName('swept-hair'));
    assert.ok(!male.root.getObjectByName('sleek-long-hair'));
    assert.ok(female.root.getObjectByName('sleek-long-hair'));
    assert.ok(female.root.getObjectByName('gold-earring'));
    for (const person of [male, female]) {
      for (const seated of [true, false, true, false]) {
        person.pose(seated, seated);
        person.root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(person.root);
        assert.ok(
          bounds.min.y >= -0.005 && bounds.min.y <= 0.075,
          `feet near floor: ${bounds.min.y}`,
        );
      }
    }
  } finally {
    disposeObject(male.root);
    disposeObject(female.root);
  }
});

test('boss spends most time seated, exits through the door, returns without teleporting, and repeats', () => {
  let seated = 0,
    outside = 0;
  let previous = bossPoseAt(0);
  for (let t = 0; t <= 360; t += 0.05) {
    const p = bossPoseAt(t);
    if (p.seated) seated++;
    if (p.z > 6.6) outside++;
    assert.ok(
      Math.hypot(p.x - previous.x, p.z - previous.z) <= 0.071,
      'continuous walk at 1.4 m/s',
    );
    if (p.z > 6.5 && p.z < 6.7) assert.ok(p.x > 0.4 && p.x < 2.25, 'passes through open doorway');
    previous = p;
  }
  assert.ok(seated / 7200 > 0.8);
  assert.ok(outside > 0);
  assert.ok(bossPoseAt(179).seated);
  assert.deepEqual(bossPoseAt(0), bossPoseAt(180));
  assert.doesNotThrow(
    () => updateBossRoom({ objects: new Map(), delta: 0 }),
    'custom rooms can omit the boss',
  );
});
