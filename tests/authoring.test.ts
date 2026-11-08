import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Builder, applyTransform } from '../office/sdk.ts';
import { Assets, localAssetPath, normalizeAsset } from '../office/assets.ts';
import { disposeObject } from '../ui/characters.ts';

test('custom asset instances are independent, with nested placement using degrees and metres', async () => {
  const assets = new Assets();
  await assets.load({
    custom: {
      type: 'factory',
      create: () =>
        new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: '#ff0000' }),
        ),
    },
  });
  const room = new THREE.Group(),
    b = new Builder(room, assets);
  b.group('rotated-group', { position: [4, 0, 3], rotation: [0, 90, 0] }, (g) =>
    g.place('sculpture', 'custom', { position: [0, 1, 2], scale: 2 }),
  );
  room.updateMatrixWorld(true);
  const first = b.objects.get('sculpture')!;
  assert.ok(
    first.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(6, 1, 3)) < 1e-8,
  );
  const second = b.place('second', 'custom');
  const a = first.children[0] as THREE.Mesh,
    c = second.children[0] as THREE.Mesh;
  assert.notEqual(a.geometry, c.geometry);
  assert.notEqual(a.material, c.material);
  (a.material as THREE.MeshStandardMaterial).color.set('#00ff00');
  assert.equal((c.material as THREE.MeshStandardMaterial).color.getHexString(), 'ff0000');
  assert.throws(() => b.place('second', 'custom'), /Duplicate/);
  assert.throws(() => b.place('unknown', 'missing'), /Unknown/);
  disposeObject(room);
  assets.templates.forEach(disposeObject);
});
test('imported model normalization and transforms preserve physical scale and floor origin', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
  mesh.position.set(10, 12, -8);
  const root = normalizeAsset(mesh, { normalize: 'floor', scale: 0.5 });
  applyTransform(root, { position: [3, 0, 1], rotation: [0, 180, 0] });
  const bounds = new THREE.Box3().setFromObject(root);
  assert.ok(Math.abs(bounds.min.y) < 1e-8);
  assert.equal(bounds.max.y, 2);
  assert.ok(bounds.getCenter(new THREE.Vector3()).distanceTo(new THREE.Vector3(3, 1, 1)) < 1e-8);
  assert.throws(() => applyTransform(root, { rotation: [0, NaN, 0] }));
  disposeObject(root);
});
test('sample GLB is a real model that loads with geometry and materials', async () => {
  const bytes = await readFile(
    new URL('../public/assets/custom/sample-column.glb', import.meta.url),
  );
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(data, '');
  let count = 0;
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) count++;
  });
  assert.equal(count, 3);
  assert.ok(new THREE.Box3().setFromObject(gltf.scene).max.y > 1);
  disposeObject(gltf.scene);
});
test('imported asset URLs stay local and reject traversal and external resources', () => {
  assert.equal(localAssetPath('/assets/custom/my-model.glb'), '/assets/custom/my-model.glb');
  for (const url of [
    'https://external.test/a.glb',
    '//external.test/a',
    '/assets/../secret',
    '/assets/%2e%2e/secret',
    'C:\\secret',
    '/api/state',
  ])
    assert.throws(() => localAssetPath(url));
});
test('seated anchor moves and turns with a custom workstation, independent of agent status', () => {
  const root = new THREE.Group(),
    anchor = new THREE.Group();
  root.add(anchor);
  anchor.position.set(0, 0, 1);
  anchor.rotation.y = Math.PI;
  applyTransform(root, { position: [5, 0.2, 2], rotation: [0, 90, 0] });
  root.updateMatrixWorld(true);
  assert.ok(
    anchor.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(6, 0.2, 2)) < 1e-8,
  );
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
    anchor.getWorldQuaternion(new THREE.Quaternion()),
  );
  assert.ok(forward.x < -0.99);
});
