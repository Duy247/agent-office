import * as THREE from 'three';
import type { BossProfile } from '../src/shared.ts';
import type { RoomPlan, RoomContext, FrameContext } from './sdk.ts';
import { createPerson } from '../ui/characters.ts';
import { lettering } from './text.ts';
import { batchStaticMeshes, optimizeCharacter } from './optimize.ts';

/** A separate local resident; never an Openbot agent or a source of work events. */
export function withBossRoom(rooms: RoomPlan[], boss?: BossProfile): RoomPlan[] {
  if (!boss || !rooms.length) return rooms;
  const left = Math.min(...rooms.map((r) => r.offsetX + r.minX));
  const first = rooms[0];
  return [
    ...rooms,
    {
      kind: 'boss',
      id: 'office:boss',
      name: boss.name,
      agents: [],
      minX: 0,
      maxX: 6.4,
      minZ: 0,
      maxZ: 6.6,
      width: 6.4,
      depth: 6.6,
      amenityZ: 0,
      offsetX: left - 7.4,
      offsetZ: first.offsetZ + first.maxZ - 6.6,
      couches: [],
      desks: new Map(),
      seats: new Map(),
    },
  ];
}

export function createBossPerson(gender: BossProfile['gender']) {
  return createPerson(
    gender === 'female' ? 2 : 0,
    gender === 'female' ? 'executive-female' : 'executive-male',
  );
}

// Clear corridor beside the desk, through the door and along the front terrace.
export const bossWalk = [
  [3.3, 1.35],
  [1.25, 1.35],
  [1.25, 7.2],
  [8.8, 7.2],
] as const;
const lengths = bossWalk
  .slice(1)
  .map((p, i) => Math.hypot(p[0] - bossWalk[i][0], p[1] - bossWalk[i][1]));
const travelTime = lengths.reduce((a, b) => a + b, 0) / 1.4;

/** Sit for most of each three-minute cycle, walk out, pause, and retrace the route. */
export function bossPoseAt(seconds: number) {
  const t = (Math.max(0, seconds) % 180) - 150;
  if (t < 0 || t >= travelTime * 2 + 4)
    return { x: 3.3, z: 1.35, facing: 0, seated: true, walking: false };
  if (t >= travelTime && t < travelTime + 4)
    return { x: 8.8, z: 7.2, facing: Math.PI, seated: false, walking: false };
  const returning = t >= travelTime + 4;
  let distance = (returning ? t - travelTime - 4 : t) * 1.4;
  const points = returning ? [...bossWalk].reverse() : [...bossWalk];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance <= length || i === points.length - 1) {
      const f = Math.min(1, distance / length);
      return {
        x: a[0] + (b[0] - a[0]) * f,
        z: a[1] + (b[1] - a[1]) * f,
        facing: Math.atan2(b[0] - a[0], b[1] - a[1]),
        seated: false,
        walking: true,
      };
    }
    distance -= length;
  }
  throw new Error('Boss walk needs at least two points.');
}

const residents = new WeakMap<
  THREE.Object3D,
  { person: ReturnType<typeof createBossPerson>; seconds: number }
>();

export function buildBossRoom(ctx: RoomContext) {
  const boss = ctx.snapshot.config.boss;
  if (!boss) return;
  const b = (
    id: string,
    size: [number, number, number],
    color: string,
    position: [number, number, number],
  ) => ctx.box(id, size, color, { position });
  b('suite-foundation', [6.4, 0.22, 6.6], '#b4b7ac', [3.2, -0.12, 3.3]);
  b('suite-floor', [6.4, 0.04, 6.6], '#e6e0d4', [3.2, 0.01, 3.3]);
  for (let i = 0; i < 16; i++)
    b(`oak-seam-${i}`, [0.012, 0.008, 6.5], '#d7cbb9', [0.18 + i * 0.4, 0.036, 3.3]);
  b('quiet-rug', [4.3, 0.025, 3.5], '#c5c1b5', [3.3, 0.043, 2.8]);
  b('back-wall', [6.4, 2.9, 0.14], '#e7e3d9', [3.2, 1.45, 0]);
  b('walnut-panel', [2.8, 2.75, 0.07], '#655447', [3.3, 1.42, 0.11]);
  for (let i = 0; i < 18; i++)
    b(`walnut-flute-${i}`, [0.025, 2.7, 0.025], '#89735d', [1.98 + i * 0.155, 1.42, 0.16]);
  b('floating-credenza', [2.5, 0.38, 0.48], '#b5a185', [3.3, 0.52, 0.43]);
  b('credenza-top', [2.56, 0.045, 0.52], '#ede8dd', [3.3, 0.735, 0.43]);
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#c5d9d5',
    transparent: true,
    opacity: 0.13,
    roughness: 0.1,
    depthWrite: false,
  });
  const pane = (id: string, size: [number, number, number], pos: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), glass.clone());
    ctx.add(id, m, { position: pos });
  };
  pane('side-glass', [0.04, 2.8, 6.6], [0, 1.45, 3.3]);
  pane('front-glass', [4.15, 2.8, 0.04], [4.325, 1.45, 6.6]);
  for (const z of [0, 3.3, 6.6])
    b(`side-frame-${z}`, [0.04, 2.92, 0.04], '#536561', [0.015, 1.46, z]);
  b('side-top-rail', [0.05, 0.04, 6.6], '#536561', [0, 2.92, 3.3]);
  b('front-top-rail', [6.4, 0.04, 0.05], '#536561', [3.2, 2.92, 6.6]);
  for (const x of [0.4, 2.25, 6.4])
    b(`door-frame-${x}`, [0.035, 2.92, 0.04], '#536561', [x, 1.46, 6.6]);
  // Open doorway at X=.4..2.25. No wall intersects the walking route.
  b('terrace', [9.8, 0.15, 1.4], '#d4c9b6', [4.9, -0.045, 7.3]);
  for (let i = 0; i < 5; i++)
    b(`terrace-seam-${i}`, [9.8, 0.004, 0.01], '#beb39f', [4.9, 0.032, 6.75 + i * 0.27]);
  b('desk-top', [2.7, 0.12, 1.18], '#e7ddc9', [3.3, 0.85, 2.65]);
  for (const x of [2.12, 4.48]) b(`desk-leg-${x}`, [0.12, 0.79, 0.85], '#4b4a44', [x, 0.395, 2.65]);
  b('desk-front', [2.3, 0.48, 0.075], '#72604d', [3.3, 0.55, 3.12]);
  b('desk-pad', [1.15, 0.014, 0.65], '#53605b', [3.3, 0.918, 2.48]);
  b('monitor-foot', [0.46, 0.025, 0.27], '#343b3c', [3.3, 0.925, 2.82]);
  b('monitor-stand', [0.055, 0.24, 0.045], '#343b3c', [3.3, 1.05, 2.87]);
  b('monitor-back', [1.04, 0.58, 0.045], '#343b3c', [3.3, 1.43, 2.89]);
  b('monitor-display', [0.96, 0.49, 0.008], '#9cb8b2', [3.3, 1.43, 2.862]);
  b('keyboard', [0.57, 0.025, 0.18], '#e5e2d8', [3.25, 0.943, 2.35]);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 10; col++)
      b(`key-${row}-${col}`, [0.038, 0.006, 0.035], '#8d9790', [
        3.01 + col * 0.05,
        0.959,
        2.3 + row * 0.05,
      ]);
  b('mouse', [0.08, 0.035, 0.12], '#deddd4', [3.78, 0.945, 2.36]);
  const chair = ctx.model(ctx.room, 'chairDesk', 3.3, 1.35, 0, Math.PI);
  const guest = ctx.model(ctx.room, 'loungeChair', 4.8, 4.6, 0, -0.6);
  for (const [object, color] of [
    [chair, '#3e4846'],
    [guest, '#c6b9a2'],
  ] as const)
    object.traverse((o) => {
      if (o instanceof THREE.Mesh)
        for (const material of Array.isArray(o.material) ? o.material : [o.material])
          if (material.name === 'carpet') (material as THREE.MeshStandardMaterial).color.set(color);
    });
  ctx.place('suite-tree', 'campus/tree', { position: [5.6, 0, 0.8], scale: 0.75 });
  ctx.place('terrace-planter', 'campus/planter', { position: [0.35, 0, 7.35], scale: 0.7 });
  const nameplate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.32),
    new THREE.MeshBasicMaterial({ map: lettering(boss.name, '#dcc6a0'), transparent: true }),
  );
  ctx.add('boss-name', nameplate, { position: [3.3, 2.04, 0.19] });
  batchStaticMeshes(ctx.room);
  const person = createBossPerson(boss.gender);
  optimizeCharacter(person);
  ctx.add('boss-resident', person.root, { position: [3.3, 0, 1.35] });
  person.pose(true, true);
  residents.set(person.root, { person, seconds: 0 });
}

export function updateBossRoom(ctx: Pick<FrameContext, 'objects' | 'delta'>) {
  const root = ctx.objects.get('boss-resident');
  if (!root) return;
  const resident = residents.get(root);
  if (!resident) return;
  resident.seconds += Math.max(0, ctx.delta);
  const p = bossPoseAt(resident.seconds),
    person = resident.person;
  root.position.set(p.x, 0, p.z);
  root.rotation.y = p.facing;
  person.pose(p.seated, p.seated);
  if (p.walking) {
    const stride = Math.sin(resident.seconds * 8) * 0.38;
    person.legs.forEach((leg, i) => {
      leg.pivot.rotation.x = i ? -stride : stride;
    });
    person.arms.forEach((arm, i) => {
      arm.rotation.x = i ? stride : -stride;
    });
    person.body.position.y += Math.abs(Math.sin(resident.seconds * 8)) * 0.018;
  }
}
