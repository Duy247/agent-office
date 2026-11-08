import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticMeshes, optimizeCharacter } from '../office/optimize.ts';
import { createPerson, disposeObject } from '../ui/characters.ts';
import { RenderBudget } from '../ui/render-budget.ts';
import { createFurniturePack } from '../scripts/build-furniture.ts';
import { readFurniturePack } from '../office/furniture-pack.ts';

const triangles = (root: THREE.Object3D) => {
  let total = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh)
      total += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
  });
  return total;
};
test('static batching preserves world bounds, triangles, material colours and moving objects', () => {
  const root = new THREE.Group();
  root.position.set(5, 1, -3);
  root.rotation.y = 0.7;
  for (let i = 0; i < 20; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1, 0.8),
      new THREE.MeshStandardMaterial({ color: i % 2 ? '#cc5544' : '#448866' }),
    );
    mesh.position.set(i * 0.6, 0.5, 0);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  const moving = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#ffffff' }),
  );
  moving.userData.officeDynamic = true;
  root.add(moving);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.2 }),
  );
  root.add(glass);
  const before = new THREE.Box3().setFromObject(root, true),
    count = triangles(root);
  const result = batchStaticMeshes(root);
  assert.equal(result.sources, 20);
  assert.equal(result.batches, 1);
  assert.equal(triangles(root), count);
  root.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(root, true);
  assert.ok(before.min.distanceTo(after.min) < 1e-5 && before.max.distanceTo(after.max) < 1e-5);
  assert.equal(moving.parent, root);
  assert.equal(glass.parent, root);
  const batch = root.getObjectByName('static-batch') as THREE.Mesh;
  const colors = batch.geometry.getAttribute('color');
  const first = new THREE.Color('#448866');
  assert.ok(Math.abs(colors.getX(0) - first.r) < 1e-6);
  assert.ok((batch.material as THREE.MeshStandardMaterial).vertexColors);
  disposeObject(root);
});
test('rigid character batching retains pose dimensions and independently animated arms', () => {
  const source = createPerson(4),
    optimized = createPerson(4);
  optimizeCharacter(optimized);
  for (const seated of [false, true, false]) {
    source.pose(seated, true);
    optimized.pose(seated, true);
    source.root.updateMatrixWorld(true);
    optimized.root.updateMatrixWorld(true);
    const a = new THREE.Box3().setFromObject(source.root, true),
      b = new THREE.Box3().setFromObject(optimized.root, true);
    assert.ok(a.min.distanceTo(b.min) < 1e-6 && a.max.distanceTo(b.max) < 1e-6);
  }
  assert.equal(triangles(source.root), triangles(optimized.root));
  optimized.arms[0].rotation.x = 0.5;
  optimized.root.updateMatrixWorld(true);
  assert.notEqual(optimized.arms[0].rotation.x, optimized.arms[1].rotation.x);
  disposeObject(source.root);
  disposeObject(optimized.root);
});
test('batching mirrored geometry preserves front-face visibility and material draw groups', () => {
  const root = new THREE.Group();
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  );
  plane.scale.x = -1;
  root.add(plane);
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(root, true).length);
  batchStaticMeshes(root);
  root.updateMatrixWorld(true);
  assert.ok(ray.intersectObject(root, true).length);
  disposeObject(root);
  const grouped = new THREE.Group();
  grouped.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      Array.from(
        { length: 6 },
        (_, i) => new THREE.MeshStandardMaterial({ color: i % 2 ? 'red' : 'blue' }),
      ),
    ),
  );
  const before = triangles(grouped);
  batchStaticMeshes(grouped);
  assert.equal(triangles(grouped), before);
  disposeObject(grouped);
});
test('compiled furniture round-trips at its original physical scale and monitor materials', async () => {
  const original = await createFurniturePack();
  const decoded = readFurniturePack(original.toJSON());
  assert.equal(decoded.children.length, 16);
  for (const source of original.children) {
    const copy = decoded.getObjectByName(source.name)!;
    assert.ok(copy, source.name);
    const a = new THREE.Box3().setFromObject(source),
      b = new THREE.Box3().setFromObject(copy);
    assert.ok(a.min.distanceTo(b.min) < 1e-6 && a.max.distanceTo(b.max) < 1e-6, source.name);
    assert.equal(triangles(source), triangles(copy));
  }
  const desk = new THREE.Box3().setFromObject(decoded.getObjectByName('kenney/desk')!);
  assert.ok(Math.abs(desk.max.y - 0.846) < 0.001);
  disposeObject(original);
  disposeObject(decoded);
});
test('adaptive resolution has a floor, a ceiling, and sustained-load hysteresis', () => {
  const budget = new RenderBudget(1.75);
  assert.equal(budget.sample(200), undefined);
  for (let i = 0; i < 119; i++) budget.sample(5);
  assert.equal(budget.ratio, 1.75, 'one startup spike does not reduce quality');
  for (let i = 0; i < 120; i++) budget.sample(30);
  assert.ok(budget.ratio < 1.75);
  for (let i = 0; i < 2400; i++) budget.sample(30);
  assert.equal(budget.ratio, 0.75);
  for (let i = 0; i < 2400; i++) budget.sample(2);
  assert.equal(budget.ratio, 1.75);
  assert.equal(budget.sample(NaN), undefined);
});
