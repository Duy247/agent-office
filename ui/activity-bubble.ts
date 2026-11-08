import * as THREE from 'three';
import type { OfficeAgent, OfficeSnapshot } from '../src/shared.ts';

/** Only live working state can speak. No invented dialogue or conversation subscriptions. */
export function workingBubbleText(
  agent: Pick<OfficeAgent, 'state' | 'activity' | 'queueCount'>,
  connection: OfficeSnapshot['connection'],
) {
  if (connection !== 'connected' || agent.state !== 'working') return null;
  const activity = agent.activity.replace(/[\u0000-\u001f]/g, ' ').trim() || 'Working';
  const concise = activity.length > 42 ? activity.slice(0, 41).trimEnd() + '…' : activity;
  return concise + (agent.queueCount > 0 ? ` · ${agent.queueCount} queued` : '');
}

export function createActivityBubble() {
  const bubble = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthTest: true, toneMapped: false }),
  );
  bubble.name = 'activity-bubble';
  bubble.position.set(0, 2.65, 0);
  bubble.visible = false;
  bubble.userData.ignorePick = true;
  return bubble;
}

export function setActivityBubble(bubble: THREE.Sprite, text: string | null, ambient = false) {
  bubble.visible = text !== null;
  const key = text + '|' + ambient;
  if (text === null || bubble.userData.key === key) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = '500 36px "Segoe UI", sans-serif';
  canvas.width = Math.ceil(Math.max(240, ctx.measureText(text).width + 64));
  canvas.height = 122;
  ctx.fillStyle = ambient ? '#f1f5e9' : '#fffdf6';
  ctx.strokeStyle = ambient ? '#91aa7f' : '#78978b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(3, 3, canvas.width - 6, 94, 22);
  ctx.fill();
  ctx.stroke();
  const mid = canvas.width / 2;
  ctx.beginPath();
  ctx.moveTo(mid - 14, 96);
  ctx.lineTo(mid, 117);
  ctx.lineTo(mid + 14, 96);
  ctx.fill();
  ctx.stroke();
  // Cover the seam where the tail joins the rounded bubble.
  ctx.fillRect(mid - 13, 93, 26, 5);
  ctx.fillStyle = '#334c42';
  ctx.font = '500 36px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, mid, 50);
  bubble.material.map?.dispose();
  bubble.material.map = new THREE.CanvasTexture(canvas);
  bubble.material.map.colorSpace = THREE.SRGBColorSpace;
  bubble.material.needsUpdate = true;
  const width = Math.min(3.1, Math.max(1.35, canvas.width / 190));
  bubble.scale.set(width, (width * canvas.height) / canvas.width, 1);
  bubble.userData.text = text;
  bubble.userData.key = key;
}
