import * as THREE from 'three';
import type { WorkstationContext, Workstation } from '../sdk.ts';
import {
  CHAIR_ROTATION,
  DESK_SURFACE,
  KEYBOARD_ROTATION,
  MONITOR_ROTATION,
  SEATED_ROTATION,
} from '../constants.ts';
import { lettering } from '../text.ts';
import { batchStaticMeshes } from '../optimize.ts';

/** The anchor is a real child of the station, so moving/rotating it also moves the seated agent. */
export function buildWorkstation(ctx: WorkstationContext, options = { batch: true }): Workstation {
  const { agent, model } = ctx,
    { x, z } = ctx.plan.desks.get(agent.id)!;
  const root = ctx.add(`desk:${agent.id}`, new THREE.Group(), { position: [x, 0, z] });
  model(root, 'desk', 0, 0);
  model(root, 'chairDesk', 0, 0.92, 0, CHAIR_ROTATION);
  const monitor = model(root, 'computerScreen', 0, -0.21, DESK_SURFACE, MONITOR_ROTATION);
  monitor.userData.officeDynamic = true;
  model(root, 'computerKeyboard', -0.13, 0.2, DESK_SURFACE, KEYBOARD_ROTATION);
  model(root, 'computerMouse', 0.48, 0.19, DESK_SURFACE);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.14),
    new THREE.MeshBasicMaterial({ map: lettering(agent.name, '#53685d', '#ebe5cd') }),
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(-0.38, 0.853, 0.33);
  root.add(plate);
  let screen: THREE.MeshStandardMaterial | undefined;
  monitor.traverse((o) => {
    if (o instanceof THREE.Mesh)
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m.name === 'metal') screen = m as THREE.MeshStandardMaterial;
  });
  if (!screen) throw new Error('Monitor screen material missing');
  screen.color.set('#84b7bb');
  screen.emissive.set('#548d93');
  const workAnchor = new THREE.Group();
  workAnchor.name = 'work-anchor';
  workAnchor.position.set(0, 0, 0.9);
  workAnchor.rotation.y = SEATED_ROTATION;
  root.add(workAnchor);
  if (options.batch) batchStaticMeshes(root);
  return { root, workAnchor, screen };
}
