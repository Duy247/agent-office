import * as THREE from 'three';
import type { RoomContext } from '../sdk.ts';
import { parkBenches } from '../activities.ts';
import { batchStaticMeshes } from '../optimize.ts';

export function buildPark(ctx: RoomContext) {
  const { plan: p } = ctx;
  if (!p.park) return;
  const cx = (p.minX + p.maxX) / 2,
    cz = (p.park.minZ + p.park.maxZ) / 2,
    depth = p.park.maxZ - p.park.minZ;
  ctx.box('park-grass', [p.width - 0.2, 0.012, depth - 0.1], '#91ad86', {
    position: [cx, 0.035, cz],
  });
  ctx.box('park-promenade', [p.width - 0.35, 0.014, 1.05], '#d9d5c7', {
    position: [cx, 0.043, p.park.minZ + 1.35],
  });
  ctx.box('park-entry-path', [1.05, 0.014, depth], '#d9d5c7', { position: [cx, 0.044, cz] });
  parkBenches(p).forEach((point, i) => {
    ctx.group(`park-bench-${i}`, { position: [point.x, 0, point.z] }, (b) => {
      for (const side of [-1, 1])
        b.box(`bench-${i}-foot-${side}`, [0.08, 0.48, 0.38], '#465f56', {
          position: [side * 0.48, 0.26, 0],
        });
      b.box(`bench-${i}-seat`, [1.35, 0.075, 0.45], '#b79c77', { position: [0, 0.54, 0] });
      for (let slat = 0; slat < 3; slat++)
        b.box(`bench-${i}-back-${slat}`, [1.35, 0.08, 0.055], '#b79c77', {
          position: [0, 0.74 + slat * 0.1, 0.22],
        });
    });
  });
  for (const [i, x] of [p.minX + 0.75, p.maxX - 0.75].entries())
    ctx.place(`park-tree-${i}`, 'campus/tree', {
      position: [x, 0.06, p.park.minZ + 0.65],
      scale: 0.9,
    });
  // Keep a full-width gap through the centre for the campus footbridges.
  for (const side of [-1, 1])
    ctx.box(`park-edge-${side}`, [(p.width - 1.3) / 2, 0.12, 0.12], '#e7e9dc', {
      position: [cx + (side * (p.width + 1.3)) / 4, 0.1, p.park.maxZ],
    });
}
export function buildCampusLinks(ctx: RoomContext) {
  for (const [i, s] of (ctx.plan.links ?? []).entries()) {
    const dx = s.to.x - s.from.x,
      dz = s.to.z - s.from.z,
      length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    ctx.box(`footbridge-${i}`, [0.9, 0.12, length + 0.9], '#d6d0bf', {
      position: [(s.from.x + s.to.x) / 2, -0.025, (s.from.z + s.to.z) / 2],
      rotation: [0, THREE.MathUtils.radToDeg(Math.atan2(dx, dz)), 0],
    });
  }
  batchStaticMeshes(ctx.room);
}
