import * as THREE from 'three';
import type { RoomContext } from './sdk.ts';
function channelTexture(name: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#294a48';
  c.fillRect(0, 0, 512, 256);
  c.fillStyle = '#f0f5e6';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  let lines: string[] = [],
    font = 48;
  for (;;) {
    c.font = `500 ${font}px "Segoe UI",sans-serif`;
    lines = [];
    let line = '';
    for (const char of name.slice(0, 80)) {
      if (c.measureText(line + char).width > 465) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
    if (line) lines.push(line);
    if (lines.length * (font + 8) <= 215 || font <= 16) break;
    font -= 4;
  }
  lines.forEach((text, i) =>
    c.fillText(text, 256, 128 + (i - (lines.length - 1) / 2) * (font + 8)),
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
export function buildConferenceScreen(ctx: RoomContext) {
  const p = ctx.plan.conference;
  if (!p) return;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.78, 0.82),
    new THREE.MeshBasicMaterial({ map: channelTexture('Conference'), toneMapped: false }),
  );
  ctx.add('conference-display', mesh, { position: [p.x, 1.85, p.z - p.depth / 2 + 0.145] });
  mesh.userData.channelName = 'Conference';
}
export function setConferenceScreen(ctx: RoomContext, name: string | undefined) {
  const mesh = ctx.objects.get('conference-display') as
    THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined;
  const text = name || 'Conference';
  if (!mesh || mesh.userData.channelName === text) return;
  mesh.material.map?.dispose();
  mesh.material.map = channelTexture(text);
  mesh.material.needsUpdate = true;
  mesh.userData.channelName = text;
  ctx.invalidate?.();
}
