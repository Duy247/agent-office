import * as THREE from 'three';
import type { RoomContext } from '../sdk.ts';
import { dressCampus } from './campus.ts';
import { lettering } from '../text.ts';
import { batchStaticMeshes } from '../optimize.ts';

/** Replace this preset or call it and add/move objects afterward. */
export function buildCampusRoom(ctx: RoomContext, options = { batch: true }) {
  const { room, plan, model } = ctx,
    { minX, maxX, minZ, maxZ, width, depth } = plan,
    cx = (minX + maxX) / 2,
    cz = (minZ + maxZ) / 2;
  ctx.box('floor-base', [width, 0.22, depth], '#bbc8be', { position: [cx, -0.12, cz] });
  ctx.box('floor', [width, 0.05, depth], '#e8ece9', { position: [cx, 0.005, cz] });
  const seams: number[] = [];
  for (let x = Math.ceil(minX); x < maxX; x++) seams.push(x, 0.036, minZ, x, 0.036, maxZ);
  for (let z = Math.ceil(minZ); z < maxZ; z++) seams.push(minX, 0.036, z, maxX, 0.036, z);
  const grid = new THREE.BufferGeometry();
  grid.setAttribute('position', new THREE.Float32BufferAttribute(seams, 3));
  ctx.add(
    'floor-grid',
    new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: '#d3ddda' })),
  );
  const pod = dressCampus(room, plan, model);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.32),
    new THREE.MeshBasicMaterial({ map: lettering(plan.name, '#3e5962'), transparent: true }),
  );
  ctx.add('room-name', plate, { position: [pod.x, 2.15, pod.z + 0.02] });
  if (options.batch) batchStaticMeshes(room);
}
