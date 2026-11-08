import * as THREE from 'three';
import type { RoomContext } from './sdk.ts';
import type { OfficeLogo } from '../src/shared.ts';
import { publicLogo } from '../src/boundary.ts';

/** Local image on a wall plaque. Position is room-local; rotation is in degrees. */
export function placeWallLogo(
  ctx: RoomContext,
  options: OfficeLogo | undefined = ctx.snapshot.config.logo,
) {
  const logo = publicLogo(options);
  if (!logo) return;
  const width = logo.width ?? 3.2,
    height = logo.height ?? 1.05;
  const root = ctx.group(
    'wall-logo',
    {
      position: logo.position ?? [ctx.plan.minX + ctx.plan.width * 0.68, 2, ctx.plan.minZ + 0.13],
      rotation: logo.rotation ?? [0, 0, 0],
    },
    (b) => {
      b.box('wall-logo-frame', [width + 0.1, height + 0.1, 0.08], '#657e80');
      b.box('wall-logo-plaque', [width, height, 0.025], '#ffffff', { position: [0, 0, 0.052] });
    },
  );
  root.visible = false;
  const material = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
  const image = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  image.position.z = 0.069;
  root.add(image);
  let disposed = false;
  material.addEventListener('dispose', () => {
    disposed = true;
  });
  const texture = new THREE.TextureLoader().load(
    logo.url,
    (loaded) => {
      if (disposed) {
        loaded.dispose();
        return;
      }
      const source = loaded.image as HTMLImageElement;
      const aspect = source.naturalWidth / source.naturalHeight;
      const w = Math.min(width * 0.88, height * 0.76 * aspect);
      image.scale.set(w, w / aspect, 1);
      root.visible = true;
    },
    undefined,
    () => {
      console.warn('Office wall logo could not be loaded. Check the local image file.');
    },
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  material.map = texture;
  return root;
}
