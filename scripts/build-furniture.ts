import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { MODEL_SCALE } from '../office/constants.ts';
const base = new URL('../public/assets/furniture-3d/', import.meta.url);
const names = [
  'desk',
  'chairDesk',
  'computerScreen',
  'computerKeyboard',
  'computerMouse',
  'loungeSofa',
  'loungeChair',
  'tableCoffee',
  'pottedPlant',
  'bookcaseOpen',
  'books',
  'kitchenCoffeeMachine',
  'kitchenCabinetDrawer',
  'kitchenFridgeSmall',
  'lampRoundFloor',
  'trashcan',
];
export async function createFurniturePack() {
  const pack = new THREE.Group();
  // Parsing and material conversion happen once at build time, rather than in every browser.
  for (const name of names) {
    const materials = new MTLLoader().parse(
      await readFile(new URL(name + '.mtl', base), 'utf8'),
      '',
    );
    const object = new OBJLoader()
      .setMaterials(materials)
      .parse(await readFile(new URL(name + '.obj', base), 'utf8'));
    const bounds = new THREE.Box3().setFromObject(object),
      center = bounds.getCenter(new THREE.Vector3());
    object.position.set(-center.x, -bounds.min.y, -center.z);
    const template = new THREE.Group();
    template.name = 'kenney/' + name;
    template.scale.setScalar(MODEL_SCALE);
    template.add(object);
    object.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const converted = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
        const material = new THREE.MeshStandardMaterial({
          color: (m as THREE.MeshPhongMaterial).color,
          roughness: 0.82,
          metalness: 0,
        });
        material.name = m.name;
        if (name === 'desk' && m.name === 'wood') material.color.set('#e6e2d6');
        if (name === 'chairDesk' && m.name === 'carpet') material.color.set('#53798e');
        return material;
      });
      o.material = Array.isArray(o.material) ? converted : converted[0];
      o.castShadow = o.receiveShadow = true;
    });
    pack.add(template);
  }
  pack.updateMatrixWorld(true);
  return pack;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pack = await createFurniturePack();
  await writeFile(new URL('office-models.json', base), JSON.stringify(pack.toJSON()));
  console.log(`Prepared ${names.length} furniture models in one browser-ready pack.`);
}
