import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { AssetDefinition, AssetLibrary } from './sdk.ts';

export function localAssetPath(url: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    throw new Error('Invalid local asset URL.');
  }
  if (
    !decoded.startsWith('/assets/') ||
    decoded.startsWith('//') ||
    /[\\?#\u0000-\u001f]/.test(decoded) ||
    decoded.split('/').some((p) => p === '..' || p === '.')
  )
    throw new Error('Model URLs must be local files under /assets/.');
  return url;
}
export function cloneAsset(source: THREE.Object3D) {
  const copy = cloneSkeleton(source);
  copy.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Sprite) {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments)
        o.geometry = o.geometry.clone();
      const cloneMaterial = (m: THREE.Material) => {
        const cloned = m.clone();
        for (const [key, value] of Object.entries(cloned))
          if (value instanceof THREE.Texture)
            (cloned as unknown as Record<string, unknown>)[key] = value.clone();
        return cloned;
      };
      o.material = Array.isArray(o.material)
        ? o.material.map(cloneMaterial)
        : cloneMaterial(o.material);
    }
  });
  return copy;
}
export function normalizeAsset(
  object: THREE.Object3D,
  definition: Pick<AssetDefinition, 'normalize' | 'scale'>,
) {
  const root = new THREE.Group();
  root.add(object);
  if (definition.normalize && definition.normalize !== 'none') {
    const bounds = new THREE.Box3().setFromObject(object);
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      object.position.x -= center.x;
      object.position.z -= center.z;
      object.position.y -= definition.normalize === 'floor' ? bounds.min.y : center.y;
    }
  }
  if (definition.scale !== undefined) {
    if (!Number.isFinite(definition.scale) || definition.scale <= 0)
      throw new Error('Asset scale must be positive.');
    root.scale.setScalar(definition.scale);
  }
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}
export class Assets implements AssetLibrary {
  readonly templates = new Map<string, THREE.Object3D>();
  has(id: string) {
    return this.templates.has(id);
  }
  instantiate(id: string) {
    const template = this.templates.get(id);
    if (!template) throw new Error(`Unknown office asset: ${id}`);
    return cloneAsset(template);
  }
  async load(definitions: Record<string, AssetDefinition>) {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) return url;
      const parsed = new URL(url, location.origin);
      if (parsed.origin !== location.origin)
        throw new Error('External model resources are disabled. Keep models and textures local.');
      localAssetPath(parsed.pathname);
      return parsed.href;
    });
    await Promise.all(
      Object.entries(definitions).map(async ([id, d]) => {
        if (this.has(id)) throw new Error(`Duplicate asset ID: ${id}`);
        let object: THREE.Object3D;
        if (d.type === 'factory') object = await d.create();
        else if (d.type === 'gltf') {
          const gltf = await new GLTFLoader(manager).loadAsync(localAssetPath(d.url));
          object = gltf.scene;
          object.animations = gltf.animations;
        } else {
          const loader = new OBJLoader(manager);
          if (d.materials) {
            const materials = await new MTLLoader(manager)
              .setResourcePath(d.materials.slice(0, d.materials.lastIndexOf('/') + 1))
              .loadAsync(localAssetPath(d.materials));
            materials.preload();
            loader.setMaterials(materials);
          }
          object = await loader.loadAsync(localAssetPath(d.url));
        }
        if (!(object instanceof THREE.Object3D))
          throw new Error(`Asset factory must return a Three.js object: ${id}`);
        this.templates.set(
          id,
          normalizeAsset(object, {
            ...d,
            normalize: d.normalize ?? (d.type === 'factory' ? 'none' : 'floor'),
          }),
        );
      }),
    );
  }
}
