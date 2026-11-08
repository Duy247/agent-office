import * as THREE from 'three';
import type { OfficeAgent, OfficeSnapshot } from '../src/shared.ts';
import type { RoomPlan } from '../ui/layout.ts';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export { planRooms as autoLayout, gridCell } from '../ui/layout.ts';
export type { RoomPlan, OfficeAgent, OfficeSnapshot };
export type Vec3 = readonly [number, number, number];
export interface Transform {
  position?: Vec3;
  rotation?: Vec3;
  scale?: number | Vec3;
}
export type AssetDefinition = (
  | { type: 'factory'; create: () => THREE.Object3D | Promise<THREE.Object3D> }
  | { type: 'gltf'; url: string }
  | { type: 'obj'; url: string; materials?: string }
) & { normalize?: 'floor' | 'center' | 'none'; scale?: number };
export interface AssetLibrary {
  instantiate(id: string): THREE.Object3D;
  has(id: string): boolean;
}
export function defineAsset<T extends AssetDefinition>(asset: T): T {
  return asset;
}
export function defineOffice<T extends OfficeDefinition>(office: T): T {
  return office;
}
export function applyTransform(object: THREE.Object3D, t: Transform = {}) {
  for (const value of [
    t.position,
    t.rotation,
    typeof t.scale === 'number' ? [t.scale, t.scale, t.scale] : t.scale,
  ])
    if (value && (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)))
      throw new Error('Transforms require three finite numbers.');
  if (t.position) object.position.set(...t.position);
  if (t.rotation)
    object.rotation.set(...(t.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
  if (t.scale !== undefined) {
    const scale = typeof t.scale === 'number' ? [t.scale, t.scale, t.scale] : t.scale;
    if (scale.some((v) => v === 0)) throw new Error('Scale must be nonzero.');
    object.scale.set(...(scale as [number, number, number]));
  }
  return object;
}
/** Scene construction helpers: positions in metres, rotations in degrees. */
export class Builder {
  readonly objects: Map<string, THREE.Object3D>;
  readonly parent: THREE.Group;
  readonly assets: AssetLibrary;
  constructor(
    parent: THREE.Group,
    assets: AssetLibrary,
    objects = new Map<string, THREE.Object3D>(),
  ) {
    this.parent = parent;
    this.assets = assets;
    this.objects = objects;
  }
  add<T extends THREE.Object3D>(id: string, object: T, transform: Transform = {}): T {
    if (!id || this.objects.has(id)) throw new Error(`Duplicate or empty office object ID: ${id}`);
    applyTransform(object, transform);
    object.name = id;
    object.userData.officeId = id;
    this.objects.set(id, object);
    this.parent.add(object);
    return object;
  }
  place(id: string, assetId: string, transform: Transform = {}) {
    return this.add(id, this.assets.instantiate(assetId), transform);
  }
  group(id: string, transform: Transform, build: (builder: Builder) => void) {
    const group = this.add(id, new THREE.Group(), transform);
    build(new Builder(group, this.assets, this.objects));
    return group;
  }
  box(id: string, size: Vec3, color: string, transform: Transform = {}) {
    if (!size.every((v) => Number.isFinite(v) && v > 0))
      throw new Error('Box dimensions must be positive metres.');
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    mesh.castShadow = mesh.receiveShadow = true;
    return this.add(id, mesh, transform);
  }
  sphere(id: string, radius: number, color: string, transform: Transform = {}) {
    if (!Number.isFinite(radius) || radius <= 0) throw new Error('Sphere radius must be positive.');
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    mesh.castShadow = mesh.receiveShadow = true;
    return this.add(id, mesh, transform);
  }
}
export interface RoomContext extends Builder {
  plan: RoomPlan;
  snapshot: OfficeSnapshot;
  room: THREE.Group;
  model: (
    parent: THREE.Group,
    name: string,
    x: number,
    z: number,
    y?: number,
    rotation?: number,
  ) => THREE.Group;
}
export interface Workstation {
  root: THREE.Group;
  workAnchor: THREE.Object3D;
  idleAnchor?: THREE.Object3D;
  screen?: THREE.MeshStandardMaterial;
}
export interface WorkstationContext extends RoomContext {
  agent: OfficeAgent;
}
export interface FrameContext {
  room: THREE.Group;
  plan: RoomPlan;
  objects: ReadonlyMap<string, THREE.Object3D>;
  snapshot: OfficeSnapshot;
  elapsed: number;
  delta: number;
}
export interface OfficeDefinition {
  camera?: { direction?: Vec3; padding?: number; maxZoom?: number };
  assets?: Record<string, AssetDefinition>;
  layout: (snapshot: OfficeSnapshot) => RoomPlan[];
  buildRoom: (context: RoomContext) => void;
  workstation: (context: WorkstationContext) => Workstation;
  configureScene?: (context: {
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    renderer: THREE.WebGLRenderer;
    sun: THREE.DirectionalLight;
    controls: OrbitControls;
  }) => void;
  update?: (context: FrameContext) => void;
  route?: (context: {
    agent: OfficeAgent;
    plan: RoomPlan;
    from: Vec3;
    to: Vec3;
    destination: 'desk' | 'lounge';
  }) => Vec3[];
}
