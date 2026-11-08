import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { createPerson, disposeObject } from '../ui/characters.ts';
import {
  MODEL_SCALE,
  DESK_SURFACE,
  CHAIR_ROTATION,
  MONITOR_ROTATION,
  SEATED_ROTATION,
} from '../ui/office3d.ts';
test('the monitor screen faces the chair, while the chair and seated person face the monitor', async () => {
  const monitor = new OBJLoader().parse(
    await readFile(
      new URL('../public/assets/furniture-3d/computerScreen.obj', import.meta.url),
      'utf8',
    ),
  );
  const normals: THREE.Vector3[] = [];
  monitor.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const group of o.geometry.groups)
        if (mats[group.materialIndex ?? 0]?.name === 'metal') {
          const n = o.geometry.getAttribute('normal');
          for (let i = group.start; i < group.start + group.count; i++)
            normals.push(new THREE.Vector3().fromBufferAttribute(n, i));
        }
    }
  });
  assert.ok(normals.length > 0);
  const normal = normals
    .reduce((a, b) => a.add(b), new THREE.Vector3())
    .normalize()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), MONITOR_ROTATION);
  assert.ok(normal.z > 0.9, 'screen front must point toward the positive-z seat');
  const chair = new OBJLoader().parse(
      await readFile(
        new URL('../public/assets/furniture-3d/chairDesk.obj', import.meta.url),
        'utf8',
      ),
    ),
    bounds = new THREE.Box3().setFromObject(chair),
    back: THREE.Vector3[] = [];
  chair.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        if (v.y > bounds.max.y * 0.75) back.push(v);
      }
    }
  });
  const backZ =
    back.reduce(
      (n, p) => n + (p.z - (bounds.min.z + bounds.max.z) / 2) * Math.cos(CHAIR_ROTATION),
      0,
    ) / back.length;
  assert.ok(backZ > 0, 'chair back belongs behind the occupant, away from the monitor');
  const facing = new THREE.Vector3(0, 0, 1).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    SEATED_ROTATION,
  );
  assert.ok(facing.z < -0.99);
  disposeObject(monitor);
  disposeObject(chair);
});

test('computer placement surface matches the actual imported desk geometry within one millimetre', async () => {
  const source = await readFile(
    new URL('../public/assets/furniture-3d/desk.obj', import.meta.url),
    'utf8',
  );
  const desk = new OBJLoader().parse(source),
    bounds = new THREE.Box3().setFromObject(desk);
  const actualHeight = (bounds.max.y - bounds.min.y) * MODEL_SCALE;
  assert.ok(
    Math.abs(DESK_SURFACE - actualHeight) < 0.001,
    `surface ${DESK_SURFACE}, actual model ${actualHeight}`,
  );
  disposeObject(desk);
});
test('standing and seated 3D character feet remain at floor level without accumulating pose drift', () => {
  const person = createPerson(4);
  for (const seated of [false, true, false, true, false]) {
    person.pose(seated);
    person.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(person.root);
    assert.ok(bounds.min.y >= -0.005 && bounds.min.y <= 0.075, `foot height ${bounds.min.y}`);
    assert.ok(bounds.max.y > 1.6 && bounds.max.y < 1.9);
  }
  disposeObject(person.root);
});
test('saved character variants have distinct 3D outfits and glasses geometry', () => {
  const alex = createPerson(1),
    luke = createPerson(4);
  const colors = (root: THREE.Object3D) => {
    const values = new Set<string>();
    root.traverse((o) => {
      if (o instanceof THREE.Mesh)
        values.add((o.material as THREE.MeshStandardMaterial).color.getHexString());
    });
    return values;
  };
  assert.ok(colors(alex.root).has('567964'));
  assert.ok(colors(luke.root).has('b38a4d'));
  assert.ok(
    luke.body.children.length > alex.body.children.length,
    'glasses have separate 3D frame geometry',
  );
  disposeObject(alex.root);
  disposeObject(luke.root);
});
