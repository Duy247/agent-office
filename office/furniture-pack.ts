import * as THREE from 'three';
/** Narrow loader for our build-produced OBJ pack; avoids shipping every Three.js geometry parser. */
export function readFurniturePack(pack: any): THREE.Group {
  const geometries = new Map<string, THREE.BufferGeometry>();
  for (const data of pack.geometries ?? [])
    geometries.set(data.uuid, new THREE.BufferGeometryLoader().parse(data));
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  for (const data of pack.materials ?? []) {
    if (data.type !== 'MeshStandardMaterial')
      throw new Error('Unsupported furniture material. Rebuild the furniture pack.');
    const m = new THREE.MeshStandardMaterial({
      color: data.color,
      roughness: data.roughness,
      metalness: data.metalness,
    });
    m.name = data.name;
    materials.set(data.uuid, m);
  }
  function read(data: any): THREE.Object3D {
    let object: THREE.Object3D;
    if (data.type === 'Mesh') {
      const geometry = geometries.get(data.geometry);
      const list = (Array.isArray(data.material) ? data.material : [data.material]).map(
        (id: string) => materials.get(id),
      );
      if (!geometry || list.some((m: unknown) => !m)) throw new Error('Incomplete furniture pack.');
      object = new THREE.Mesh(
        geometry,
        Array.isArray(data.material) ? (list as THREE.MeshStandardMaterial[]) : list[0],
      );
    } else if (data.type === 'Group') object = new THREE.Group();
    else throw new Error('Unsupported furniture object.');
    object.name = data.name ?? '';
    object.castShadow = data.castShadow === true;
    object.receiveShadow = data.receiveShadow === true;
    if (data.matrix)
      new THREE.Matrix4()
        .fromArray(data.matrix)
        .decompose(object.position, object.quaternion, object.scale);
    for (const child of data.children ?? []) object.add(read(child));
    return object;
  }
  return read(pack.object) as THREE.Group;
}
