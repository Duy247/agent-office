import * as THREE from 'three';
export function lettering(value: string, color = '#41564f', background?: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const c = canvas.getContext('2d')!;
  if (background) {
    c.fillStyle = background;
    c.fillRect(0, 0, 512, 112);
  }
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = '500 42px Segoe UI, sans-serif';
  c.fillText(value.slice(0, 45), 256, 56, 490);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
