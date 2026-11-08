import * as THREE from 'three';

export const outfits = [
  '#527c96',
  '#567964',
  '#b27068',
  '#737196',
  '#b38a4d',
  '#456e78',
  '#a37187',
  '#6c7888',
];
const skins = [
  '#e5b88d',
  '#bd885f',
  '#f0c5a2',
  '#845a44',
  '#d8a477',
  '#e3bca1',
  '#bd855d',
  '#efcba8',
];
const hairs = [
  '#463e36',
  '#554132',
  '#372e2e',
  '#252c30',
  '#684b35',
  '#75594b',
  '#3d3331',
  '#aa8560',
];
export function createPerson(variant: number, style?: 'executive-male' | 'executive-female') {
  const executive = !!style,
    female = style === 'executive-female';
  const c = ((variant % 8) + 8) % 8,
    root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
  const skin = mat(skins[c]),
    shirt = mat(executive ? (female ? '#e8ddd0' : '#293740') : outfits[c]),
    hair = mat(hairs[c]),
    trousers = mat(executive ? (female ? '#51454d' : '#293740') : '#354656'),
    shoes = mat('#293339'),
    white = mat('#e9eadb');
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    m: THREE.Material,
    parent: THREE.Group = body,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  box(executive && !female ? 0.49 : 0.43, 0.49, 0.28, 0, 1.03, 0, shirt);
  box(0.31, 0.16, 0.26, 0, 0.72, 0, trousers);
  box(0.12, 0.16, 0.13, 0, 1.34, 0, skin);
  box(0.37, 0.4, 0.34, 0, 1.57, 0, skin);
  box(0.4, 0.11, 0.37, 0, 1.79, -0.01, hair);
  box(0.4, 0.31, 0.09, 0, 1.62, -0.16, hair);
  box(0.07, 0.19, 0.35, -0.18, 1.69, 0, hair);
  if (!executive && (c === 1 || c === 3 || c === 6)) {
    box(0.09, 0.5, 0.3, -0.2, 1.49, -0.02, hair);
    box(0.09, 0.5, 0.3, 0.2, 1.49, -0.02, hair);
  }
  for (const x of [-0.09, 0.09]) {
    box(0.035, 0.04, 0.015, x, 1.59, 0.176, shoes);
    box(0.06, 0.025, 0.02, x, 1.6, 0.185, white);
    box(0.018, 0.034, 0.022, x, 1.591, 0.2, shoes);
  }
  box(0.055, 0.025, 0.035, 0, 1.53, 0.19, skin);
  box(0.09, 0.012, 0.012, 0, 1.46, 0.18, mat('#a96d60'));
  if (c === 4) {
    const frames = mat('#303e47');
    for (const x of [-0.095, 0.095]) {
      box(0.15, 0.018, 0.022, x, 1.655, 0.205, frames);
      box(0.15, 0.018, 0.022, x, 1.545, 0.205, frames);
      box(0.018, 0.12, 0.022, x - 0.07, 1.6, 0.205, frames);
      box(0.018, 0.12, 0.022, x + 0.07, 1.6, 0.205, frames);
    }
    box(0.045, 0.018, 0.022, 0, 1.62, 0.205, frames);
  }
  box(
    executive ? 0.16 : 0.11,
    executive ? 0.33 : 0.07,
    0.03,
    0,
    executive ? 1.08 : 1.26,
    0.15,
    white,
  );
  if (!executive && c % 3 === 0) box(0.045, 0.29, 0.025, 0, 1.08, 0.16, mat('#374c65'));
  if (executive) {
    const gold = mat('#bc995d');
    const lapel = mat(female ? '#f5ece0' : '#41505a');
    for (const side of [-1, 1]) {
      const l = box(0.09, 0.31, 0.035, side * 0.115, 1.12, 0.168, lapel);
      l.rotation.z = side * -0.3;
      l.name = 'tailored-lapel';
      box(0.025, 0.025, 0.025, side * 0.07, 0.94, 0.17, gold).name = 'gold-button';
    }
    box(0.14, 0.025, 0.025, 0.135, 1.16, 0.18, white).name = 'pocket-square';
    if (female) {
      box(0.42, 0.48, 0.1, 0, 1.48, -0.19, hair).name = 'sleek-long-hair';
      box(0.095, 0.43, 0.3, -0.2, 1.48, -0.01, hair);
      box(0.075, 0.3, 0.14, 0.2, 1.56, -0.1, hair);
      for (const side of [-1, 1])
        box(0.026, 0.07, 0.025, side * 0.207, 1.46, 0.08, gold).name = 'gold-earring';
      box(0.38, 0.035, 0.025, 0, 0.83, 0.155, gold).name = 'waist-belt';
    } else {
      box(0.37, 0.065, 0.18, 0.025, 1.86, -0.07, hair).name = 'swept-hair';
    }
  }
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.28, 1.23, 0);
    body.add(pivot);
    box(0.13, 0.38, 0.17, 0, -0.16, 0, shirt, pivot);
    box(0.11, 0.18, 0.13, 0, -0.43, 0, skin, pivot);
    if (executive && side === -1)
      box(0.135, 0.035, 0.15, 0, -0.35, 0, mat('#bc995d'), pivot).name = 'watch';
    return pivot;
  });
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.71, 0);
    root.add(pivot);
    box(female ? 0.21 : 0.16, 0.34, 0.2, 0, -0.17, 0, trousers, pivot);
    const knee = new THREE.Group();
    knee.position.y = -0.34;
    pivot.add(knee);
    const shin = box(female ? 0.21 : 0.15, 0.3, 0.19, 0, -0.15, 0, trousers, knee);
    const foot = box(0.18, 0.12, 0.32, 0, -0.31, 0.065, shoes, knee);
    return { pivot, knee, shin, foot };
  });
  const pose = (seated: boolean, work = false) => {
    body.position.y = seated ? -0.15 : 0;
    for (const leg of legs) {
      leg.pivot.position.y = seated ? 0.56 : 0.71;
      leg.pivot.rotation.x = seated ? -Math.PI / 2 : 0;
      leg.knee.rotation.x = seated ? Math.PI / 2 : 0;
      leg.shin.scale.y = seated ? 1.4 : 1;
      leg.shin.position.y = seated ? -0.21 : -0.15;
      leg.foot.position.y = seated ? -0.46 : -0.31;
    }
    for (const arm of arms) arm.rotation.x = work ? -0.8 : seated ? -0.15 : 0;
  };
  pose(false);
  return { root, body, arms, legs, pose };
}

const portraits = new Map<number, string>();
let portraitRenderer: THREE.WebGLRenderer | undefined;
let releasePortrait: ReturnType<typeof setTimeout> | undefined;
export function characterPortrait(variant: number) {
  if (portraits.has(variant)) return portraits.get(variant)!;
  if (releasePortrait) clearTimeout(releasePortrait);
  const renderer = (portraitRenderer ??= new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  }));
  renderer.setSize(160, 160);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(),
    person = createPerson(variant);
  scene.add(person.root);
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aa59a', 2.8));
  const sun = new THREE.DirectionalLight('#fff7e7', 3);
  sun.position.set(-3, 5, 5);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-0.66, 0.66, 0.66, -0.66, 0.01, 20);
  camera.position.set(2, 2.1, 5);
  camera.lookAt(0, 1.34, 0);
  renderer.render(scene, camera);
  const data = renderer.domElement.toDataURL();
  portraits.set(variant, data);
  disposeObject(person.root);
  // Avatar effects in one panel share a context; release it as soon as that burst settles.
  releasePortrait = setTimeout(() => {
    portraitRenderer?.dispose();
    portraitRenderer?.forceContextLoss();
    portraitRenderer = undefined;
    releasePortrait = undefined;
  }, 250);
  return data;
}
export function disposeObject(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>(),
    geometries = new Set<THREE.BufferGeometry>(),
    textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite || o instanceof THREE.LineSegments) {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const value of Object.values(m))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
  geometries.forEach((g) => g.dispose());
}
