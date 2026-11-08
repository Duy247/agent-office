// To use this example: replace office/office.ts with `export {default} from './examples/minimal.ts';`
import * as THREE from 'three';
import { autoLayout, defineOffice } from '../sdk.ts';

export default defineOffice({
  layout: autoLayout,
  buildRoom(ctx) {
    const p = ctx.plan;
    ctx.box('floor', [p.width, 0.12, p.depth], '#e5e8dc', {
      position: [(p.minX + p.maxX) / 2, -0.06, (p.minZ + p.maxZ) / 2],
    });
    ctx.box('wall', [p.width, 2.5, 0.1], '#b9ced3', {
      position: [(p.minX + p.maxX) / 2, 1.25, p.minZ],
    });
    ctx.sphere('your-art', 0.5, '#c17b91', { position: [p.maxX - 1, 0.5, p.maxZ - 1] });
    p.couches.forEach((seat, i) => {
      ctx.box('bench:' + i, [2.3, 0.1, 0.65], '#94aeba', { position: [seat.x, 0.46, seat.z] });
      ctx.box('bench-back:' + i, [2.3, 0.65, 0.08], '#94aeba', {
        position: [seat.x, 0.79, seat.z - 0.3],
      });
      for (const side of [-1, 1])
        ctx.box('bench-leg:' + i + ':' + side, [0.1, 0.42, 0.5], '#677e83', {
          position: [seat.x + side, 0.25, seat.z],
        });
    });
  },
  workstation(ctx) {
    const { x, z } = ctx.plan.desks.get(ctx.agent.id)!;
    const root = ctx.group('station:' + ctx.agent.id, { position: [x, 0, z] }, (b) => {
      b.box('top:' + ctx.agent.id, [1.5, 0.08, 0.8], '#d5bb91', { position: [0, 0.8, 0] });
      for (const side of [-1, 1])
        b.box('leg:' + ctx.agent.id + side, [0.08, 0.76, 0.7], '#677e83', {
          position: [side * 0.63, 0.38, 0],
        });
      b.box('chair-seat:' + ctx.agent.id, [0.44, 0.08, 0.44], '#94aeba', {
        position: [0, 0.51, 0.9],
      });
      b.box('chair-back:' + ctx.agent.id, [0.44, 0.56, 0.06], '#94aeba', {
        position: [0, 0.82, 1.1],
      });
      b.box('chair-base:' + ctx.agent.id, [0.12, 0.47, 0.12], '#677e83', {
        position: [0, 0.275, 0.9],
      });
    });
    const workAnchor = new THREE.Group();
    workAnchor.position.set(0, 0, 0.9);
    workAnchor.rotation.y = Math.PI;
    root.add(workAnchor);
    return { root, workAnchor };
  },
});
