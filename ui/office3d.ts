import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { OfficeAgent, OfficeSnapshot, OfficeState } from '../src/shared.ts';
import { createPerson, disposeObject } from './characters.ts';
import type { RoomPlan } from './layout.ts';
import office from '../office/office.ts';
import { Builder } from '../office/sdk.ts';
import type {
  OfficeDefinition,
  RoomContext,
  FrameContext,
  WorkstationContext,
  Vec3,
} from '../office/sdk.ts';
import { Assets } from '../office/assets.ts';
import { lettering } from '../office/text.ts';
import { createActivityBubble, setActivityBubble, workingBubbleText } from './activity-bubble.ts';
import { MODEL_SCALE } from '../office/constants.ts';
import { optimizeCharacter } from '../office/optimize.ts';
import { RenderBudget } from './render-budget.ts';
import { readFurniturePack } from '../office/furniture-pack.ts';
import { ActivityDirector, ambientBubble } from '../office/activities.ts';
import type { ActivityGoal } from '../office/activities.ts';
import { CampusRouter } from '../office/navigation.ts';
import { setConferenceScreen } from '../office/conference-screen.ts';
export {
  MODEL_SCALE,
  DESK_SURFACE,
  CHAIR_ROTATION,
  MONITOR_ROTATION,
  SEATED_ROTATION,
} from '../office/constants.ts';
const design: OfficeDefinition = office;

const colors: Record<OfficeState, string> = {
  idle: '#477d67',
  working: '#437fd5',
  queued: '#b08a43',
  question: '#d69b36',
  approval: '#b76745',
  takeover: '#946ac4',
  failed: '#cf5350',
  unknown: '#7e9390',
};
type Person = ReturnType<typeof createPerson>;
type Actor = {
  person: Person;
  agent: OfficeAgent;
  desk: THREE.Vector3;
  seat: THREE.Vector3;
  indicator: THREE.Mesh;
  badge: THREE.Sprite;
  label: THREE.Sprite;
  bubble: THREE.Sprite;
  ring: THREE.Mesh;
  screen?: THREE.MeshStandardMaterial;
  path: THREE.Vector3[];
  targetKey: string;
  plan: RoomPlan;
  workFacing: number;
  idleFacing: number;
  goal?: ActivityGoal;
};

function label(value: string, width = 1.3, color = '#41564f', background?: string) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: lettering(value, color, background),
      depthTest: true,
      toneMapped: false,
    }),
  );
  sprite.scale.set(width, (width * 112) / 512, 1);
  return sprite;
}
function setBadge(sprite: THREE.Sprite, value: string, color: string) {
  const key = value + color;
  if (sprite.userData.key === key) return;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fffcf0';
  ctx.beginPath();
  ctx.roundRect(6, 6, 116, 116, 24);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.font = '600 82px Segoe UI, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, 64, 68, 108);
  sprite.material.map?.dispose();
  sprite.material.map = new THREE.CanvasTexture(c);
  sprite.material.map.colorSpace = THREE.SRGBColorSpace;
  sprite.material.needsUpdate = true;
  sprite.scale.set(0.43, 0.43, 1);
  sprite.userData.key = key;
}
export function createOffice3D(
  canvas: HTMLCanvasElement,
  onSelect: (id: string) => void,
  onError: (message: string) => void,
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  const budget = new RenderBudget(
    Math.min(devicePixelRatio || 1, design.performance?.maxPixelRatio ?? 1.75),
  );
  renderer.setPixelRatio(budget.ratio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8edeb');
  scene.add(new THREE.HemisphereLight('#f7faf8', '#c2cec0', 2.4));
  const sun = new THREE.DirectionalLight('#fff5e4', 3.3);
  sun.position.set(-5, 13, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00012;
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 150);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minPolarAngle = 0.28;
  controls.maxPolarAngle = Math.PI / 2 - 0.08;
  controls.minZoom = 0.45;
  controls.maxZoom = design.camera?.maxZoom ?? 20;
  controls.enablePan = true;
  const floorShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.ShadowMaterial({ opacity: 0.12 }),
  );
  floorShadow.rotation.x = -Math.PI / 2;
  floorShadow.position.y = -0.24;
  floorShadow.receiveShadow = true;
  scene.add(floorShadow);
  const world = new THREE.Group();
  scene.add(world);
  const actors = new Map<string, Actor>(),
    library = new Assets(),
    templates = library.templates;
  const rooms: RoomContext[] = [];
  let plans: RoomPlan[] = [],
    router: CampusRouter | undefined;
  const director = new ActivityDirector();
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    media = matchMedia('(prefers-reduced-motion: reduce)');
  let snapshot: OfficeSnapshot | undefined,
    selected: string | null = null,
    signature = '',
    visualSignature = '',
    ready = false,
    disposed = false,
    contextLost = false,
    frame = 0,
    last = 0,
    animationElapsed = 0,
    fitWidth = 15,
    fitHeight = 11,
    viewDirty = true;
  let down: { x: number; y: number } | undefined;
  function wake() {
    if (!disposed && !contextLost && !document.hidden && !frame)
      frame = requestAnimationFrame(draw);
  }
  function invalidate() {
    viewDirty = true;
    wake();
  }
  controls.addEventListener('change', invalidate);
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      last = performance.now();
      invalidate();
    }
  };
  document.addEventListener('visibilitychange', visibility);
  media.addEventListener('change', invalidate);
  const loseContext = () => {
    contextLost = true;
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const restoreContext = () => {
    contextLost = false;
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  };
  canvas.addEventListener('webglcontextlost', loseContext);
  canvas.addEventListener('webglcontextrestored', restoreContext);
  const pickDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
  };
  const pickUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    down = undefined;
    const b = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - b.left) / b.width) * 2 - 1,
      (-(e.clientY - b.top) / b.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(world.children, true)) {
      if (!hit.object.visible || hit.object.userData.ignorePick) continue;
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.agentId) o = o.parent;
      if (o?.userData.agentId) {
        onSelect(o.userData.agentId);
        break;
      }
      if (
        hit.object instanceof THREE.Mesh &&
        !(hit.object.material instanceof THREE.ShadowMaterial)
      )
        break;
    }
  };
  canvas.addEventListener('pointerdown', pickDown);
  canvas.addEventListener('pointerup', pickUp);
  const resize = () => {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h,
      half = Math.max(fitHeight / 2, fitWidth / aspect / 2);
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  function resetView() {
    world.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(world);
    if (bounds.isEmpty()) {
      controls.target.set(0, 0.5, 0);
      camera.position.set(12, 12, 15);
      camera.zoom = 1;
      controls.update();
      resize();
      return;
    }
    const center = bounds.getCenter(new THREE.Vector3()),
      distance = Math.max(30, bounds.getSize(new THREE.Vector3()).length() * 2);
    controls.target.copy(center);
    camera.position
      .copy(center)
      .add(
        new THREE.Vector3(...(design.camera?.direction ?? [12, 12, 15]))
          .normalize()
          .multiplyScalar(distance),
      );
    camera.zoom = 1;
    camera.far = Math.max(150, distance * 3);
    controls.update();
    camera.updateMatrixWorld(true);
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const v = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          x0 = Math.min(x0, v.x);
          x1 = Math.max(x1, v.x);
          y0 = Math.min(y0, v.y);
          y1 = Math.max(y1, v.y);
        }
    fitWidth = (x1 - x0) * (design.camera?.padding ?? 1.14);
    fitHeight = (y1 - y0) * (design.camera?.padding ?? 1.14);
    resize();
  }
  function focusAgent(id: string) {
    const actor = actors.get(id);
    if (!actor) return;
    world.updateMatrixWorld(true);
    const target = actor.person.root
        .getWorldPosition(new THREE.Vector3())
        .add(new THREE.Vector3(0, 0.9, 0)),
      offset = camera.position.clone().sub(controls.target);
    controls.target.copy(target);
    camera.position.copy(target).add(offset);
    camera.zoom = Math.min(controls.maxZoom, Math.max(1, (camera.top - camera.bottom) / 5.5));
    controls.update();
    camera.updateProjectionMatrix();
    invalidate();
  }

  resetView();
  design.configureScene?.({ scene, camera, renderer, sun, controls });
  async function load() {
    try {
      const [pack] = await Promise.all([
        fetch('/assets/furniture-3d/office-models.json').then(async (response) => {
          if (!response.ok) throw new Error('Furniture pack is missing. Run npm run build.');
          return readFurniturePack(await response.json());
        }),
        library.load(design.assets ?? {}),
      ]);
      for (const template of [...pack.children]) {
        template.removeFromParent();
        templates.set(template.name, template);
      }
      if (disposed) {
        templates.forEach(disposeObject);
        return;
      }
      ready = true;
      signature = '';
      sync();
      canvas.dataset.sceneReady = 'true';
    } catch (e) {
      if (!disposed)
        onError(
          'Office asset error: ' +
            (e instanceof Error ? e.message : 'Could not load local assets.'),
        );
    }
  }
  function model(parent: THREE.Group, name: string, x: number, z: number, y = 0, rotation = 0) {
    const wrapper = new THREE.Group();
    wrapper.add(library.instantiate('kenney/' + name));
    wrapper.position.set(x, y, z);
    wrapper.rotation.y = rotation;
    parent.add(wrapper);
    return wrapper;
  }
  function rebuild() {
    for (const child of [...world.children]) {
      world.remove(child);
      disposeObject(child);
    }
    actors.clear();
    rooms.length = 0;
    plans = design.layout(snapshot!);
    router = new CampusRouter(plans);
    for (const plan of plans) {
      const room = new THREE.Group();
      room.position.set(plan.offsetX, 0, plan.offsetZ);
      world.add(room);
      const ctx = Object.assign(new Builder(room, library), {
        plan,
        snapshot: snapshot!,
        room,
        model,
        invalidate,
      }) satisfies RoomContext;
      rooms.push(ctx);
      design.buildRoom(ctx);
      if (!plan.agents.length && !plan.kind) {
        const empty = label('Create agents in Openbot.', 3.5);
        empty.position.set((plan.minX + plan.maxX) / 2, 0.7, (plan.minZ + plan.maxZ) / 2);
        room.add(empty);
      }
      for (const a of plan.agents) {
        const stationCtx = Object.assign(new Builder(room, library, ctx.objects), {
          plan,
          snapshot: snapshot!,
          room,
          model,
          agent: a,
        }) satisfies WorkstationContext;
        const station = design.workstation(stationCtx);
        if (!station?.root || !station.workAnchor)
          throw new Error('Workstations must return root and workAnchor.');
        if (!station.root.parent) room.add(station.root);
        station.root.userData.agentId = a.id;
        let ancestor: THREE.Object3D | null = station.workAnchor;
        while (ancestor && ancestor !== station.root) ancestor = ancestor.parent;
        if (!ancestor) throw new Error('workAnchor must belong to the workstation root.');
        room.updateWorldMatrix(true, true);
        const desk = room.worldToLocal(station.workAnchor.getWorldPosition(new THREE.Vector3()));
        const relativeFacing = (anchor: THREE.Object3D) =>
          new THREE.Euler().setFromQuaternion(
            room
              .getWorldQuaternion(new THREE.Quaternion())
              .invert()
              .multiply(anchor.getWorldQuaternion(new THREE.Quaternion())),
            'YXZ',
          ).y;
        const workFacing = relativeFacing(station.workAnchor);
        const lounge = plan.seats.get(a.id);
        if (!lounge && !station.idleAnchor)
          throw new Error('Provide an idle seat in the room plan or an idleAnchor.');
        const seat = station.idleAnchor
            ? room.worldToLocal(station.idleAnchor.getWorldPosition(new THREE.Vector3()))
            : new THREE.Vector3(lounge!.x, 0, lounge!.z),
          idleFacing = station.idleAnchor ? relativeFacing(station.idleAnchor) : 0;
        const person = createPerson(a.character);
        optimizeCharacter(person);
        person.root.userData.agentId = a.id;
        room.add(person.root);
        const name = label(a.name, 1.4);
        name.position.set(0, 2.0, 0);
        person.root.add(name);
        const bubble = createActivityBubble();
        person.root.add(bubble);
        const indicator = new THREE.Mesh(
          new THREE.SphereGeometry(0.065, 10, 8),
          new THREE.MeshBasicMaterial({ color: colors[a.state] }),
        );
        indicator.position.set(0.35, 1.96, 0);
        person.root.add(indicator);
        const badge = label('', 0.46);
        badge.position.set(0.43, 2.3, 0);
        person.root.add(badge);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.3, 0.34, 40),
          new THREE.MeshBasicMaterial({ color: '#3d826c', side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.07;
        person.root.add(ring);
        person.root.position.copy(a.state === 'idle' ? seat : desk);
        actors.set(a.id, {
          person,
          agent: a,
          desk,
          seat,
          indicator,
          badge,
          label: name,
          bubble,
          ring,
          screen: station.screen,
          path: [],
          targetKey: '',
          plan,
          workFacing,
          idleFacing,
        });
      }
    }
    world.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(world),
      center = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3());
    sun.position.copy(center).add(new THREE.Vector3(-10, 20, 10));
    sun.target.position.copy(center);
    scene.add(sun.target);
    const shadowExtent = size.length() / 2 + 5;
    sun.shadow.camera.left = -shadowExtent;
    sun.shadow.camera.right = shadowExtent;
    sun.shadow.camera.top = shadowExtent;
    sun.shadow.camera.bottom = -shadowExtent;
    sun.shadow.camera.far = size.length() * 3 + 100;
    sun.shadow.camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    resetView();
  }
  function sync() {
    if (!snapshot || !ready || disposed) return;
    const next = JSON.stringify([
      snapshot.groups,
      snapshot.config.logo,
      snapshot.config.boss,
      snapshot.channels?.map((c) => [c.id, c.agentIds]),
      snapshot.agents.map((a) => [a.id, a.name, a.character, a.groupId, a.deskIndex, a.desk]),
    ]);
    const visual = JSON.stringify([
      snapshot.connection,
      snapshot.config.reducedMotion,
      selected,
      snapshot.agents.map((a) => [a.state, a.queueCount, a.activity]),
      snapshot.channels,
    ]);
    if (next === signature && visual === visualSignature) return;
    if (next !== signature) {
      try {
        rebuild();
        signature = next;
        onError('');
      } catch (e) {
        onError('Office build error: ' + (e instanceof Error ? e.message : 'Unknown scene error'));
        return;
      }
    }
    for (const a of snapshot.agents) {
      const actor = actors.get(a.id);
      if (!actor) continue;
      actor.agent = a;
      setActivityBubble(actor.bubble, workingBubbleText(a, snapshot.connection));
      (actor.indicator.material as THREE.MeshBasicMaterial).color.set(colors[a.state]);
      actor.ring.visible = a.id === selected;
      const text =
        a.state === 'question'
          ? '?'
          : a.state === 'approval'
            ? '!'
            : a.state === 'takeover'
              ? '↗'
              : a.state === 'failed'
                ? '×'
                : a.queueCount
                  ? String(a.queueCount)
                  : '';
      actor.badge.visible = !!text;
      if (text) setBadge(actor.badge, text, colors[a.state]);
    }
    applyActivityGoals(0, true);
    visualSignature = visual;
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }
  function goalPoint(actor: Actor, goal: ActivityGoal, approach = false) {
    if (goal.kind === 'desk')
      return actor.desk
        .clone()
        .add(approach ? new THREE.Vector3(0.65, 0, 0.7) : new THREE.Vector3());
    if (goal.kind === 'lounge')
      return actor.seat.clone().add(approach ? new THREE.Vector3(0, 0, 0.75) : new THREE.Vector3());
    const host = plans.find((p) => p.id === goal.roomId)!;
    const point = approach ? (goal.approach ?? goal) : goal;
    return new THREE.Vector3(
      point.x + host.offsetX - actor.plan.offsetX,
      approach ? 0 : (goal.y ?? 0),
      point.z + host.offsetZ - actor.plan.offsetZ,
    );
  }
  function applyActivityGoals(delta = 0, force = false) {
    if (!snapshot || snapshot.connection !== 'connected') return;
    const goals = director.update(snapshot, plans, delta, force);
    for (const ctx of rooms) setConferenceScreen(ctx, director.meetings.get(ctx.plan.id)?.name);
    for (const actor of actors.values()) {
      const goal = goals.get(actor.agent.id);
      if (!goal) continue;
      const key = goal.roomId + ':' + goal.id;
      if (key === actor.targetKey) continue;
      const end = goalPoint(actor, goal),
        start = actor.person.root.position;
      let path: THREE.Vector3[] = [];
      const reduced = snapshot.config.reducedMotion || media.matches;
      if (start.distanceTo(end) > 0.05 && !reduced) {
        if (design.route) {
          path = design
            .route({
              agent: actor.agent,
              plan: actor.plan,
              from: start.toArray() as unknown as Vec3,
              to: end.toArray() as unknown as Vec3,
              destination: goal.kind,
            })
            .map((p) => new THREE.Vector3(...p));
          path.push(end.clone());
        } else if (actor.plan.park && router) {
          const startApproach =
            !actor.path.length && actor.goal?.seated
              ? goalPoint(actor, actor.goal, true)
              : start.clone();
          const endApproach = goal.seated ? goalPoint(actor, goal, true) : end.clone();
          const world = (v: THREE.Vector3) => ({
            x: v.x + actor.plan.offsetX,
            z: v.z + actor.plan.offsetZ,
          });
          const route = router.route(world(startApproach), world(endApproach), goal.roomId);
          if (!route) continue;
          if (startApproach.distanceTo(start) > 0.05) path.push(startApproach);
          path.push(
            ...route.map(
              (p) => new THREE.Vector3(p.x - actor.plan.offsetX, 0, p.z - actor.plan.offsetZ),
            ),
            end.clone(),
          );
        } else path = [new THREE.Vector3(start.x, 0, end.z), end.clone()];
      }
      actor.goal = goal;
      actor.targetKey = key;
      actor.path = path;
      if (reduced || start.distanceTo(end) <= 0.05) actor.person.root.position.copy(end);
    }
  }
  const moveDelta = new THREE.Vector3();
  function draw(time: number) {
    frame = 0;
    if (disposed || contextLost || document.hidden) return;
    if (time - last < 33) {
      wake();
      return;
    }
    const dt = Math.min(0.06, (time - last) / 1000);
    last = time;
    const reduced =
      media.matches || snapshot?.config.reducedMotion || snapshot?.connection !== 'connected';
    if (reduced && !viewDirty) return;
    if (!reduced) animationElapsed += dt;
    controls.enableDamping = !reduced;
    controls.update();
    if (!reduced) applyActivityGoals(dt);
    for (const actor of actors.values()) {
      const moving = actor.path.length > 0;
      if (!reduced && moving) {
        const target = actor.path[0],
          delta = moveDelta.copy(target).sub(actor.person.root.position);
        if (delta.length() < 0.055) {
          actor.person.root.position.copy(target);
          actor.path.shift();
        } else {
          actor.person.root.rotation.y = Math.atan2(delta.x, delta.z);
          actor.person.root.position.addScaledVector(
            delta.normalize(),
            Math.min(1.7 * dt, delta.length()),
          );
        }
      } else if (reduced && actor.path.length && snapshot?.connection === 'connected') {
        actor.person.root.position.copy(actor.path[actor.path.length - 1]);
        actor.path = [];
      }
      const seated = !actor.path.length && (actor.goal?.seated ?? true);
      const usingHands =
        (actor.agent.state === 'working' && (!actor.goal || actor.goal.kind === 'desk')) ||
        (actor.agent.state === 'idle' && !!actor.goal?.id.startsWith('arcade-'));
      actor.person.pose(seated, usingHands && !actor.path.length);
      if (!reduced && actor.path.length) {
        const stride = Math.sin(animationElapsed * 8) * 0.38;
        actor.person.legs.forEach((leg, i) => (leg.pivot.rotation.x = i ? -stride : stride));
        actor.person.arms.forEach((arm, i) => (arm.rotation.x = i ? stride : -stride));
      }
      if (!actor.path.length && actor.goal)
        actor.person.root.rotation.y =
          actor.goal.kind === 'desk'
            ? actor.workFacing
            : actor.goal.kind === 'lounge'
              ? actor.idleFacing
              : actor.goal.facing;
      setActivityBubble(
        actor.bubble,
        workingBubbleText(actor.agent, snapshot!.connection) ??
          (!reduced
            ? ambientBubble(
                actor.agent,
                actor.goal,
                animationElapsed,
                !!actor.path.length,
                snapshot!.connection,
              )
            : null),
        actor.agent.state === 'idle',
      );

      if (!reduced) {
        actor.person.body.position.y += moving
          ? Math.sin(time / 95) * 0.025
          : Math.sin(time / 800) * 0.008;
        if (actor.agent.state === 'working')
          actor.person.arms.forEach(
            (arm, i) => (arm.rotation.x += Math.sin(time / 150 + i) * 0.045),
          );
      }
      if (actor.screen)
        actor.screen.emissiveIntensity = actor.agent.state === 'working' ? 0.4 : 0.09;
      // Name/status labels face the camera independently of the character's direction.
    }
    if (!reduced && snapshot && design.update) {
      try {
        for (const ctx of rooms)
          design.update({
            room: ctx.room,
            plan: ctx.plan,
            objects: ctx.objects,
            snapshot,
            elapsed: animationElapsed,
            delta: dt,
          });
      } catch (e) {
        onError(
          'Office animation error: ' + (e instanceof Error ? e.message : 'Unknown animation error'),
        );
      }
    }
    if (!reduced) renderer.shadowMap.needsUpdate = true;
    const renderStarted = performance.now();
    renderer.render(scene, camera);
    const renderMs = performance.now() - renderStarted;
    viewDirty = false;
    if (!reduced && design.performance?.adaptiveResolution !== false) {
      const ratio = budget.sample(renderMs);
      if (ratio !== undefined) {
        renderer.setPixelRatio(ratio);
        resize();
      }
    }
    if (!reduced) wake();
  }
  wake();
  void load();
  return {
    update(state: OfficeSnapshot, id: string | null) {
      snapshot = state;
      selected = id;
      sync();
    },
    resetView,
    focusAgent,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      controls.removeEventListener('change', invalidate);
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', invalidate);
      canvas.removeEventListener('webglcontextlost', loseContext);
      canvas.removeEventListener('webglcontextrestored', restoreContext);
      canvas.removeEventListener('pointerdown', pickDown);
      canvas.removeEventListener('pointerup', pickUp);
      disposeObject(world);
      templates.forEach(disposeObject);
      floorShadow.geometry.dispose();
      (floorShadow.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
