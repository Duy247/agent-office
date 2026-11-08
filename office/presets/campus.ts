import * as THREE from 'three';
import type { RoomPlan } from '../../ui/layout.ts';

type Model = (
  parent: THREE.Group,
  name: string,
  x: number,
  z: number,
  y?: number,
  rotation?: number,
) => THREE.Group;
export function createTree() {
  const root = new THREE.Group();
  tree(root, 0, 0);
  return root;
}
export function createPlanter() {
  const root = new THREE.Group();
  planter(root, 0, 0);
  return root;
}
export function createArcade() {
  const root = new THREE.Group();
  arcade(root, 0, 0, '#638b9c');
  return root;
}
export function createTableTennis() {
  const root = new THREE.Group();
  pingPong(root, 0, 0);
  return root;
}
const material = (color: string, roughness = 0.75) =>
  new THREE.MeshStandardMaterial({ color, roughness });
function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  color: string | THREE.Material,
  x: number,
  y: number,
  z: number,
) {
  const m = new THREE.Mesh(geometry, typeof color === 'string' ? material(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function block(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: string | THREE.Material,
) {
  return mesh(parent, new THREE.BoxGeometry(w, h, d), color, x, y, z);
}
function cylinder(
  parent: THREE.Object3D,
  r: number,
  h: number,
  x: number,
  y: number,
  z: number,
  color: string,
) {
  return mesh(parent, new THREE.CylinderGeometry(r, r, h, 20), color, x, y, z);
}
function recolor(root: THREE.Object3D, name: string, color: string) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh)
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m.name === name) (m as THREE.MeshStandardMaterial).color.set(color);
  });
}
function glass(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
) {
  const m = block(
    parent,
    w,
    h,
    d,
    x,
    y,
    z,
    new THREE.MeshPhysicalMaterial({
      color: '#a9d6e2',
      transparent: true,
      opacity: 0.19,
      roughness: 0.12,
      metalness: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  m.castShadow = false;
  m.userData.ignorePick = true;
  return m;
}

function tree(parent: THREE.Object3D, x: number, z: number, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  parent.add(group);
  mesh(group, new THREE.CylinderGeometry(0.35, 0.27, 0.48, 12), '#eff1e6', 0, 0.28, 0);
  cylinder(group, 0.27, 0.035, 0, 0.53, 0, '#4c5740');
  const trunk = mesh(group, new THREE.CylinderGeometry(0.065, 0.1, 1.3, 9), '#87705b', 0, 1.16, 0);
  trunk.rotation.z = -0.06;
  const branch = cylinder(group, 0.04, 0.7, 0.16, 1.6, 0.05, '#87705b');
  branch.rotation.z = -0.6;
  const clusters = [
    [-0.28, 2.05, 0.02, 0.63],
    [0.27, 2.13, 0.08, 0.65],
    [0.0, 2.55, -0.03, 0.66],
    [-0.1, 2.2, -0.31, 0.55],
    [0.15, 1.93, 0.36, 0.5],
  ];
  clusters.forEach(([xx, y, zz, r], i) => {
    const leaf = mesh(
      group,
      new THREE.IcosahedronGeometry(r, 1),
      ['#407f62', '#579269', '#629e71', '#376f59', '#7cab78'][i],
      xx,
      y,
      zz,
    );
    leaf.scale.set(1, 0.9, 0.85);
  });
}
function planter(parent: THREE.Object3D, x: number, z: number, length = 1.7) {
  block(parent, length, 0.42, 0.4, x, 0.25, z, '#f1f1e7');
  block(parent, length - 0.09, 0.025, 0.31, x, 0.47, z, '#58654d');
  for (let i = 0; i < 7; i++) {
    const plant = mesh(
      parent,
      new THREE.IcosahedronGeometry(0.22, 0),
      i % 2 ? '#6f9f73' : '#497d58',
      x - length / 2 + 0.2 + (i * (length - 0.4)) / 6,
      0.66 + (i % 2) * 0.08,
      z,
    );
    plant.scale.y = 1.3;
  }
}
function pingPong(parent: THREE.Object3D, x: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.name = 'Table tennis';
  parent.add(g);
  for (const xx of [-1, 1])
    for (const zz of [-0.48, 0.48]) block(g, 0.07, 0.69, 0.07, xx, 0.39, zz, '#31434c');
  block(g, 2.1, 0.09, 0.07, 0, 0.25, 0, '#31434c');
  block(g, 2.76, 0.065, 1.54, 0, 0.765, 0, '#eaf0e8');
  block(g, 2.68, 0.025, 1.46, 0, 0.811, 0, '#285b7a');
  block(g, 2.67, 0.006, 0.018, 0, 0.829, 0, '#eef5ec');
  block(
    g,
    0.025,
    0.18,
    1.55,
    0,
    0.935,
    0,
    new THREE.MeshStandardMaterial({
      color: '#d6e8df',
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    }),
  );
  block(g, 0.035, 0.015, 1.6, 0, 1.035, 0, '#f8f8ea');
  for (const zz of [-0.79, 0.79]) cylinder(g, 0.018, 0.26, 0, 0.925, zz, '#36494e');
  for (const [xx, zz, col] of [
    [-0.84, 0.33, '#d36e62'],
    [0.85, -0.3, '#273c48'],
  ] as const) {
    cylinder(g, 0.11, 0.025, xx, 0.839, zz, col);
    block(g, 0.075, 0.025, 0.17, xx, 0.839, zz + 0.15, '#c8aa7c');
  }
  mesh(g, new THREE.SphereGeometry(0.035, 12, 8), '#fffdf0', -0.55, 0.858, 0.28);
}
function arcade(parent: THREE.Object3D, x: number, z: number, color: string) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.name = 'Arcade cabinet';
  parent.add(g);
  block(g, 0.65, 0.85, 0.65, 0, 0.47, 0, color);
  block(g, 0.67, 0.56, 0.55, 0, 1.16, -0.03, '#30434b');
  const screen = block(g, 0.49, 0.37, 0.025, 0, 1.18, 0.263, '#141f32');
  screen.rotation.x = -0.08;
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 3; j++)
      if ((i + j) % 3 !== 0)
        block(
          g,
          0.047,
          0.025,
          0.008,
          -0.16 + i * 0.08,
          1.09 + j * 0.075,
          0.285,
          ['#63d4bb', '#f2bd66', '#dd7c99'][(i + j) % 3],
        );
  block(g, 0.72, 0.09, 0.35, 0, 0.9, 0.2, color);
  cylinder(g, 0.014, 0.14, -0.18, 1.01, 0.28, '#273c48');
  mesh(g, new THREE.SphereGeometry(0.045, 12, 8), '#ec7d67', -0.18, 1.095, 0.28);
  for (let i = 0; i < 3; i++)
    cylinder(g, 0.028, 0.018, 0.06 + i * 0.08, 0.96, 0.3, ['#e6b855', '#77b9ad', '#e5829a'][i]);
  block(g, 0.72, 0.15, 0.63, 0, 1.52, -0.03, color);
  block(g, 0.51, 0.055, 0.02, 0, 1.53, 0.294, '#f3d582');
  block(g, 0.15, 0.025, 0.02, 0, 0.59, 0.335, '#e9d9b2');
}
function cafe(parent: THREE.Group, x: number, z: number, model: Model) {
  block(parent, 3.1, 1, 0.8, x, 0.55, z, '#b9916f');
  for (let i = 0; i < 24; i++)
    block(parent, 0.035, 0.83, 0.025, x - 1.43 + i * 0.124, 0.55, z + 0.412, '#e1c7a3');
  block(parent, 3.22, 0.09, 0.95, x, 1.085, z, '#f1f1e6');
  model(parent, 'kitchenCoffeeMachine', x - 0.9, z, 1.13);
  for (let i = 0; i < 3; i++) {
    const xx = x - 0.85 + i * 0.85;
    cylinder(parent, 0.25, 0.08, xx, 0.78, z + 1, '#527f88');
    for (const side of [-1, 1]) {
      block(parent, 0.035, 0.7, 0.035, xx + side * 0.16, 0.39, z + 0.86, '#3f5055');
      block(parent, 0.035, 0.7, 0.035, xx + side * 0.16, 0.39, z + 1.14, '#3f5055');
    }
  }
  for (let i = 0; i < 3; i++) {
    cylinder(
      parent,
      0.055,
      0.1,
      x + 0.25 + i * 0.2,
      1.18,
      z + 0.1,
      ['#e1b35e', '#7ba999', '#e8e9dd'][i],
    );
  }
  mesh(parent, new THREE.SphereGeometry(0.09, 12, 8), '#dfa45b', x + 1, 1.23, z);
  mesh(parent, new THREE.SphereGeometry(0.08, 12, 8), '#95af61', x + 1.16, 1.22, z + 0.05);
}
function meetingPod(parent: THREE.Group, plan: RoomPlan, model: Model) {
  const x = plan.minX + 2.35,
    z = plan.minZ + 1.7,
    w = 3.55,
    d = 2.65;
  block(parent, w, 0.035, d, x, 0.055, z, '#a8bcb3');
  for (const xx of [x - w / 2, x + w / 2]) {
    glass(parent, 0.035, 2.35, d, xx, 1.25, z);
    for (const zz of [z - d / 2, z + d / 2])
      block(parent, 0.045, 2.45, 0.045, xx, 1.28, zz, '#667c7d');
    block(parent, 0.055, 0.045, d, xx, 2.52, z, '#667c7d');
  }
  glass(parent, w, 2.35, 0.035, x, 1.25, z - d / 2);
  glass(parent, w, 2.35, 0.035, x, 1.25, z + d / 2);
  for (const zz of [z - d / 2, z + d / 2]) {
    block(parent, w, 0.045, 0.055, x, 2.52, zz, '#667c7d');
    block(parent, w, 0.09, 0.025, x, 1.12, zz, '#d8e8e0');
  }
  // A framed door and handle, with a transparent face toward the main office.
  for (const xx of [x - 0.45, x + 0.45])
    block(parent, 0.025, 2.22, 0.04, xx, 1.22, z + d / 2 + 0.03, '#8ba3a0');
  block(parent, 0.035, 0.33, 0.035, x + 0.32, 1.14, z + d / 2 + 0.09, '#687e7b');
  cylinder(parent, 0.1, 0.66, x, 0.42, z, '#657d79');
  cylinder(parent, 0.83, 0.075, x, 0.79, z, '#e3d1b4');
  for (const [dx, dz, rot] of [
    [0, 0.9, 0],
    [0, -0.9, Math.PI],
    [1.05, 0, Math.PI / 2],
    [-1.05, 0, -Math.PI / 2],
  ]) {
    const chair = model(parent, 'chairDesk', x + dx, z + dz, 0.04, rot);
    chair.scale.setScalar(0.67);
    recolor(chair, 'carpet', '#5b8a92');
  }
  block(parent, 1.15, 0.64, 0.045, x, 1.75, z - d / 2 + 0.07, '#344d58');
  block(parent, 1.04, 0.53, 0.02, x, 1.75, z - d / 2 + 0.1, '#a0c6c7');
  for (let i = 0; i < 4; i++)
    block(
      parent,
      0.1,
      0.12 + i * 0.07,
      0.008,
      x - 0.3 + i * 0.2,
      1.66 + i * 0.035,
      z - d / 2 + 0.116,
      ['#d4b872', '#8db59b', '#6c9bb1', '#b8a2b8'][i],
    );
  return { x, z: z + d / 2 + 0.05 };
}

export function dressCampus(parent: THREE.Group, plan: RoomPlan, model: Model) {
  const { minX, maxX, minZ, maxZ, width, depth, amenityZ } = plan,
    cx = (minX + maxX) / 2;
  // Floor-to-ceiling glazing and slim steel frames; the camera-facing edges stay open.
  block(parent, width, 0.22, 0.18, cx, 0.16, minZ, '#e5ebe6');
  block(parent, width, 0.07, 0.14, cx, 2.76, minZ, '#6e8587');
  for (let x = minX + 0.07; x < maxX; x += 2.35) {
    const span = Math.min(2.3, maxX - x);
    glass(parent, span, 2.43, 0.035, x + span / 2, 1.47, minZ + 0.025);
    block(parent, 0.045, 2.65, 0.08, x, 1.43, minZ, '#758e90');
    block(parent, span, 0.035, 0.06, x + span / 2, 1.42, minZ + 0.02, '#9cb2b0');
  }
  block(parent, 0.045, 2.65, 0.08, maxX, 1.43, minZ, '#758e90');
  block(parent, 0.14, 0.86, depth, minX, 0.47, (minZ + maxZ) / 2, '#dce5df');
  block(parent, 0.18, 0.05, depth, minX, 0.92, (minZ + maxZ) / 2, '#f4f5e9');
  // A vertical garden with warm timber fins, rather than a solid blank wall.
  block(parent, 0.07, 1.65, 2.75, minX + 0.1, 1.8, 0.9, '#476f55');
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 6; j++) {
      const greenery = mesh(
        parent,
        new THREE.IcosahedronGeometry(0.16, 0),
        (i + j) % 3 ? '#679268' : '#3e7657',
        minX + 0.23,
        1.08 + j * 0.27,
        -0.36 + i * 0.165,
      );
      greenery.scale.x = 0.5;
    }
  for (let i = 0; i < 12; i++)
    block(parent, 0.06, 1.65, 0.05, minX + 0.16, 1.8, 2.5 + i * 0.1, '#c2a17b');
  const pod = meetingPod(parent, plan, model);
  tree(parent, maxX - 0.7, minZ + 0.8, 0.95);
  plan.couches.forEach((couch, i) => {
    block(
      parent,
      3.35,
      0.025,
      3.3,
      couch.x,
      0.05,
      couch.z + 1.05,
      ['#adc7c3', '#c8c4d3', '#d6c6a4'][i % 3],
    );
    const sofa = model(parent, 'loungeSofa', couch.x, couch.z, 0, Math.PI);
    recolor(sofa, 'carpet', ['#4c8c9a', '#9c7391', '#c6a452', '#718f75'][i % 4]);
    const table = model(parent, 'tableCoffee', couch.x, couch.z + 1.7);
    recolor(table, 'wood', '#d7bd96');
    if (i % 2 === 0) tree(parent, couch.x - 1.4, couch.z - 0.1, 0.72);
    else planter(parent, couch.x - 1.35, couch.z - 0.2, 0.5);
  });
  // Dedicated front strip keeps recreation clear of every workstation as the room grows.
  block(parent, width - 0.4, 0.018, 4.1, cx, 0.042, amenityZ + 0.15, '#d5c3a8');
  for (let z = amenityZ - 1.8; z < amenityZ + 2.2; z += 0.28)
    block(parent, width - 0.4, 0.005, 0.008, cx, 0.056, z, '#c9b795');
  cafe(parent, minX + 2.6, amenityZ + 0.05, model);
  arcade(parent, minX + 6, amenityZ + 0.4, '#638b9c');
  arcade(parent, minX + 6.85, amenityZ + 0.4, '#aa7d94');
  for (let x = minX + 9; x < maxX - 4; x += 4) {
    cylinder(parent, 0.1, 0.71, x, 0.43, amenityZ + 0.2, '#78918d');
    cylinder(parent, 0.72, 0.08, x, 0.825, amenityZ + 0.2, '#e8e6dc');
    for (const dx of [-1, 1]) {
      cylinder(parent, 0.23, 0.08, x + dx, 0.57, amenityZ + 0.2, '#9c879f');
      cylinder(parent, 0.045, 0.49, x + dx, 0.29, amenityZ + 0.2, '#536b6c');
    }
  }
  pingPong(parent, maxX - 2.1, amenityZ + 0.2);
  planter(parent, 0.5, amenityZ - 1.75, 1.7);
  planter(parent, maxX - 1.2, amenityZ - 1.75, 1.5);
  tree(parent, minX + 0.7, maxZ - 0.65, 0.9);
  tree(parent, maxX - 0.7, amenityZ - 2.9, 0.9);
  return pod;
}
