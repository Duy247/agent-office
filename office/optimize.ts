import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Opt-in for finished, static scenery. Keep animated objects outside this pass. */
export function batchStaticMeshes(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<
    string,
    {
      material: THREE.Material;
      geometries: THREE.BufferGeometry[];
      cast: boolean;
      receive: boolean;
      order: number;
    }
  >();
  const sources: THREE.Mesh[] = [];
  const oldGeometries = new Set<THREE.BufferGeometry>(),
    oldMaterials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.SkinnedMesh ||
      object instanceof THREE.InstancedMesh ||
      object.morphTargetInfluences ||
      !object.visible
    )
      return;
    for (
      let parent: THREE.Object3D | null = object;
      parent && parent !== root;
      parent = parent.parent
    )
      if (!parent.visible || parent.userData.officeDynamic) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (
      materials.some(
        (m) =>
          !(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshBasicMaterial) ||
          m.transparent ||
          m.opacity !== 1 ||
          m.alphaTest !== 0 ||
          Object.values(m).some((v) => v instanceof THREE.Texture) ||
          m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile,
      )
    )
      return;
    if (
      Object.values(object.geometry.attributes).some(
        (a) => a instanceof THREE.InterleavedBufferAttribute,
      )
    )
      return;
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    const position = geometry.getAttribute('position');
    if (!position) {
      geometry.dispose();
      return;
    }
    const groups = Array.isArray(object.material)
      ? geometry.groups
      : [{ start: 0, count: position.count, materialIndex: 0 }];
    if (!groups.length) {
      geometry.dispose();
      return;
    }
    const transform = inverse.clone().multiply(object.matrixWorld);
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0] as THREE.MeshStandardMaterial;
      const start = Math.max(group.start, geometry.drawRange.start);
      const end = Math.min(
        group.start + group.count,
        position.count,
        geometry.drawRange.start + geometry.drawRange.count,
      );
      if (end <= start) continue;
      const part = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const a = attribute as THREE.BufferAttribute;
        part.setAttribute(
          name,
          new THREE.BufferAttribute(
            a.array.slice(start * a.itemSize, end * a.itemSize),
            a.itemSize,
            a.normalized,
          ),
        );
      }
      const color = material.color;
      const previous = part.getAttribute('color');
      const colors = new Float32Array((end - start) * 3);
      for (let i = 0; i < end - start; i++) {
        colors[i * 3] = color.r * (material.vertexColors && previous ? previous.getX(i) : 1);
        colors[i * 3 + 1] = color.g * (material.vertexColors && previous ? previous.getY(i) : 1);
        colors[i * 3 + 2] = color.b * (material.vertexColors && previous ? previous.getZ(i) : 1);
      }
      part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      part.applyMatrix4(transform);
      // Baking a mirrored transform must retain the renderer's original front-face winding.
      if (transform.determinant() < 0)
        for (const attribute of Object.values(part.attributes)) {
          const a = attribute as THREE.BufferAttribute;
          for (let vertex = 0; vertex < a.count; vertex += 3)
            for (let item = 0; item < a.itemSize; item++) {
              const first = (vertex + 1) * a.itemSize + item,
                second = (vertex + 2) * a.itemSize + item;
              const saved = a.array[first];
              a.array[first] = a.array[second];
              a.array[second] = saved;
            }
        }
      const json = material.toJSON() as unknown as Record<string, unknown>;
      for (const key of ['uuid', 'metadata', 'name', 'color', 'vertexColors', 'userData'])
        delete json[key];
      const attributes = Object.entries(part.attributes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, a]) => [key, a.itemSize, a.normalized, a.array.constructor.name]);
      const key = JSON.stringify([
        json,
        attributes,
        object.castShadow,
        object.receiveShadow,
        object.renderOrder,
      ]);
      let bucket = buckets.get(key);
      if (!bucket) {
        const copy = material.clone();
        copy.color.set('#ffffff');
        copy.vertexColors = true;
        bucket = {
          material: copy,
          geometries: [],
          cast: object.castShadow,
          receive: object.receiveShadow,
          order: object.renderOrder,
        };
        buckets.set(key, bucket);
      }
      bucket.geometries.push(part);
    }
    geometry.dispose();
    sources.push(object);
    oldGeometries.add(object.geometry);
    materials.forEach((m) => oldMaterials.add(m));
  });
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geometries);
    bucket.geometries.forEach((g) => g.dispose());
    if (!geometry) throw new Error('Static scenery could not be batched.');
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, bucket.material);
    mesh.name = 'static-batch';
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    mesh.renderOrder = bucket.order;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldNeedsUpdate = true;
    root.add(mesh);
  }
  sources.forEach((mesh) => mesh.removeFromParent());
  // Do not dispose resources still referenced by transparent or animated objects.
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      oldGeometries.delete(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        oldMaterials.delete(m),
      );
    }
  });
  oldGeometries.forEach((g) => g.dispose());
  oldMaterials.forEach((m) => m.dispose());
  return { sources: sources.length, batches: buckets.size };
}

/** Merge rigid character sections; retain every arm/leg joint for normal animation. */
export function optimizeCharacter(person: { body: THREE.Group; arms: THREE.Group[] }) {
  person.arms.forEach((arm) => {
    arm.userData.officeDynamic = true;
  });
  batchStaticMeshes(person.body);
  person.arms.forEach((arm) => batchStaticMeshes(arm));
}
