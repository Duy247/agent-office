import * as THREE from 'three';
/** Example of an asset authored entirely in code. Origin is its floor contact point. */
export function createSculpture() {
  const root = new THREE.Group();
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.3, 0.3, 32),
    new THREE.MeshStandardMaterial({ color: '#ece8dd', roughness: 0.85 }),
  );
  plinth.position.y = 0.15;
  root.add(plinth);
  const sculpture = new THREE.Group();
  sculpture.name = 'rings';
  sculpture.position.y = 0.82;
  root.add(sculpture);
  for (const [index, color] of ['#4c899e', '#c17b91'].entries()) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.055, 12, 48),
      new THREE.MeshStandardMaterial({ color, metalness: 0.32, roughness: 0.4 }),
    );
    ring.rotation.set(index * 0.9, index * 0.8, 0.25 + index * 0.4);
    sculpture.add(ring);
  }
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}
