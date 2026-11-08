// YOUR OFFICE DESIGN. Edit this file; the connector and agent state stay separate.
import * as THREE from 'three';
import { autoLayout, defineAsset, defineOffice } from './sdk.ts';
import { buildCampusRoom } from './presets/room.ts';
import { buildWorkstation } from './presets/workstation.ts';
import { createSculpture } from './assets/sculpture.ts';
import { createTree, createPlanter, createArcade, createTableTennis } from './presets/campus.ts';

export default defineOffice({
  camera: { direction: [12, 12, 15], padding: 1.14, maxZoom: 20 },
  assets: {
    'campus/tree': defineAsset({ type: 'factory', create: createTree }),
    'campus/planter': defineAsset({ type: 'factory', create: createPlanter }),
    'campus/arcade': defineAsset({ type: 'factory', create: createArcade }),
    'campus/table-tennis': defineAsset({ type: 'factory', create: createTableTennis }),
    sculpture: defineAsset({ type: 'factory', create: createSculpture }),
    // Replace with your Blender export. Self-contained, uncompressed GLB is simplest.
    sampleColumn: defineAsset({
      type: 'gltf',
      url: '/assets/custom/sample-column.glb',
      normalize: 'floor',
    }),
  },
  layout(snapshot) {
    const rooms = autoLayout(snapshot);
    // Examples: rooms[0].desks.set('agent-id', {x:2, z:1});
    // Expand room bounds and update width/depth if you move desks outside the floor.
    return rooms;
  },
  buildRoom(ctx) {
    buildCampusRoom(ctx); // Delete this call and build your entire room with ctx.box/group/place.
    ctx.place('my-sculpture', 'sculpture', {
      position: [ctx.plan.minX + 4.7, 0, ctx.plan.amenityZ + 1.5],
      rotation: [0, 30, 0], // DEGREES. X=left/right, Y=height, Z=front/back; units are metres.
      scale: 1,
    });
    ctx.place('my-import', 'sampleColumn', {
      position: [ctx.plan.minX + 5.7, 0, ctx.plan.amenityZ + 1.5],
      rotation: [0, 90, 0],
      scale: 0.6,
    });
  },
  workstation(ctx) {
    const station = buildWorkstation(ctx);
    // station.root.position.set(2,0,1); station.root.rotation.y=THREE.MathUtils.degToRad(90);
    // The agent follows station.workAnchor. Return your own root+anchor for a custom desk.
    return station;
  },
  configureScene({ scene }) {
    scene.background = new THREE.Color('#e8edeb');
  },
  update({ objects, elapsed }) {
    // Visual-only animation; automatically paused for reduced motion and stale connections.
    const rings = objects.get('my-sculpture')?.getObjectByName('rings');
    if (rings) rings.rotation.y = elapsed * 0.12;
  },
});
