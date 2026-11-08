# Build your office in code

Start with `office/office.ts`. This is ordinary TypeScript with full Three.js access. The renderer calls your room builder and workstation builder whenever the roster/layout changes. Runtime status updates remain separate from construction.

Use `npm run dev` while the connector is running. Open http://127.0.0.1:5173. Changes under `office/` or `public/assets/custom/` reload the preview. Save syntax/type errors appear in the development overlay; scene/asset errors appear in the office. `npm run typecheck` checks your design. `npm run build` updates the normal office at port 4318. On Windows, Edit office.cmd starts the connector and preview.

## Place anything

Inside `buildRoom(ctx)`:

```ts
ctx.place('tree-near-door', 'campus/tree', {
  position: [2, 0, 3],
  rotation: [0, 45, 0],
  scale: 0.8,
});

ctx.box('platform', [3, 0.2, 2], '#dbc6a4', {
  position: [2, 0.1, 1],
});

ctx.group('reading-corner', { position: [4, 0, 2], rotation: [0, 90, 0] }, (b) => {
  b.place('corner-chair', 'kenney/loungeChair');
  b.place('corner-plant', 'campus/planter', { position: [1, 0, 0] });
});
```

Coordinates are **metres**: X left/right, Y height, Z front/back. Builder rotations are **degrees**, in X/Y/Z order. Direct Three.js `object.rotation` uses radians. Scale is a number or `[x,y,z]`. Floor level is Y=0. Imported objects can keep their origin or be centered and grounded. Every placed object needs a unique ID within its room, including children of groups. Repeating IDs across different rooms is fine.

`ctx.add(id, object, transform)` accepts any Three.js object, so you can use arbitrary geometry, materials, lights, groups and meshes. `ctx.box` and `ctx.sphere` are conveniences, not the limits of the builder. Access placed objects through `ctx.objects.get(id)`.

Registered assets include `campus/tree`, `campus/planter`, `campus/arcade`, `campus/table-tennis`, the example `sculpture`, `sampleColumn`, and the bundled Kenney furniture names prefixed with `kenney/` (for example `kenney/desk`, `kenney/chairDesk`, `kenney/pottedPlant`). Kenney models retain their shared physical scale. Standalone pieces have their native facing; use explicit rotations when assembling a workstation.

## Create your own asset

Create `office/assets/my-art.ts`:

```ts
import * as THREE from 'three';

export function createArt() {
  const root = new THREE.Group();
  const shape = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.3, 0.07, 72, 12),
    new THREE.MeshStandardMaterial({ color: '#537fa7', metalness: 0.3, roughness: 0.4 }),
  );
  shape.position.y = 0.6;
  shape.castShadow = true;
  root.add(shape);
  return root;
}
```

Register it in the `assets` object in `office/office.ts`:

```ts
myArt: defineAsset({type: 'factory', create: createArt}),
```

Then call `ctx.place('art-in-lobby', 'myArt', {position: [1, 0, 2]})`. Factories may return a promise. Each placement gets independent geometry and materials, so recoloring or moving one instance does not change the others. Use factory assets for procedural models and Three.js materials, including your own textures loaded from local files.

## Import Blender / other models

Put your model and its resources under `public/assets/custom/`. Export a **self-contained, uncompressed GLB** from Blender for the simplest workflow. Use metres and an origin at the object's base; otherwise use floor normalization.

```ts
mySofa: defineAsset({
  type: 'gltf',
  url: '/assets/custom/my-sofa.glb',
  normalize: 'floor',
  scale: 1,
}),

myCabinet: defineAsset({
  type: 'obj',
  url: '/assets/custom/cabinet.obj',
  materials: '/assets/custom/cabinet.mtl',
  normalize: 'floor',
}),
```

Both `.glb` and `.gltf` use GLTFLoader. Keep referenced buffers/textures beside the model or at valid local `/assets/` URLs. Remote model resources are deliberately rejected. Compressed Draco/Meshopt/KTX models require adding local decoders to `office/assets.ts`; none are downloaded automatically. The included `sample-column.glb` is a real example you can place immediately. Its original geometry is generated for this project.

Normalization options: `floor` centers X/Z and places the lowest point on Y=0; `center` centers all axes; `none` preserves the exported origin. Imported glTF animation clips remain on the asset's `animations` array. You may drive them with a Three.js AnimationMixer in your own code; dispose mixers/resources you create outside the scene graph.

## Replace the entire room

Remove `buildCampusRoom(ctx)` from `buildRoom` and construct your own scene. `office/examples/minimal.ts` is a complete room built without the campus preset. To try it, replace `office/office.ts` with:

```ts
export { default } from './examples/minimal.ts';
```

The editable campus preset is `office/presets/campus.ts`; its floor/nameplate wrapper is `office/presets/room.ts`. No generated or minified files need editing.

## Layout, rooms and agent desks

`layout(snapshot)` receives filtered connector data and returns `RoomPlan[]`. The default `autoLayout(snapshot)` makes one room per group, expands with the roster and saves stable desk slots. You can instead create any room plans, change room bounds, offsets, desk/idle coordinates and group placement. Each plan must supply its agents, a desk point and an idle point per agent, floor bounds, width/depth and scene offsets. Provide idleAnchor on the workstation if you want to omit a plan idle point.

```ts
layout(snapshot) {
  const rooms = autoLayout(snapshot);
  const room = rooms[0];
  room.desks.set('agent-id-from-your-connector', {x: 3, z: 2});
  return rooms;
},
```

Room bounds/packing are your responsibility when overriding automatic layout: expand `minX/maxX/minZ/maxZ`, recompute `width/depth`, and separate neighboring rooms if you move things outside the old floor. The renderer fits the camera from actual scene geometry. Nothing creates or modifies agents in their source platform.

`workstation(ctx)` can use the preset, adjust it, or return an entirely custom model:

```ts
workstation(ctx) {
  const station = buildWorkstation(ctx);
  station.root.position.set(2, 0, 1);
  station.root.rotation.y = THREE.MathUtils.degToRad(90);
  return station;
},
```

Return `{root, workAnchor, idleAnchor?, screen?}`. `workAnchor` must be a child of `root`; its position and Y rotation determine where the agent sits and faces. Moving/rotating the root automatically moves/rotates the agent target. Optional idleAnchor works the same way. Optional screen is a MeshStandardMaterial whose glow follows working state. The engine handles identity, selection and status markers; your builder handles the furniture. Character geometry and portraits share `ui/characters.ts` if you want to redesign the people.

Custom walls/furniture may require custom walking paths. Define `route({agent, plan, from, to, destination})` to return intermediate `[x,y,z]` points in room coordinates. The engine appends the destination. There is no collision solver or navmesh; do not assume an arbitrary wall will automatically reroute agents.

## Lights, camera and animation

`configureScene({scene, camera, renderer, sun, controls})` gives full access to the Three.js scene. Add lights, change exposure/material styles or configure controls. `camera.direction`, `camera.padding` and `camera.maxZoom` configure the automatic view.

`update({room, plan, objects, snapshot, elapsed, delta})` runs per visual frame while connected and motion is enabled. Use it for fans, art, ambient animation or mixers. It pauses for reduced motion, the Pause motion button and stale connections. The example sculpture demonstrates an animation using its object ID. Do not make AI calls for animation. Your local design code is trusted code, not a sandbox.

Run `npm run package` to export a clean source template. Export excludes local settings, credentials, connection proof and personal screenshots.
