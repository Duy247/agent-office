import { BloubBot, COLOR_BY_ID, EXPRESSIONS, SHAPES } from '@norbert_bodziony/bloub';
import { renderToString } from '@solidjs/web';
import type { OfficeAvatar } from './shared.ts';

export interface AvatarImage {
  bytes: Buffer;
  mimeType: string;
}
export const imageMimes = ['image/png', 'image/jpeg', 'image/webp'];
export const avatarPathPattern =
  /^\/v1\/agents\/[A-Za-z0-9_-]{1,128}\/avatar\?v=[A-Za-z0-9_-]{1,128}$/;
export function validAvatarImage(image: AvatarImage) {
  const b = image.bytes;
  return (
    b.length > 0 &&
    b.length <= 2 * 1024 * 1024 &&
    ((image.mimeType === 'image/png' &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (image.mimeType === 'image/jpeg' && b[0] === 255 && b[1] === 216 && b[2] === 255) ||
      (image.mimeType === 'image/webp' &&
        b.toString('ascii', 0, 4) === 'RIFF' &&
        b.toString('ascii', 8, 12) === 'WEBP'))
  );
}
const choose = <T>(items: readonly T[], value: string): T => {
  let n = 2166136261;
  for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return items[(n >>> 0) % items.length];
};
const palette = ['rouge', 'orange', 'ambre', 'vert', 'turquoise', 'bleu', 'violet', 'rose'];
export function avatarProfile(avatar: OfficeAvatar) {
  let shape = choose(SHAPES, avatar.seed + ':shape').id;
  if (shape === 'goutte')
    shape = choose(
      SHAPES.filter((s) => s.id !== 'goutte'),
      avatar.seed + ':shape:replacement',
    ).id;
  const hues: Record<number, string> = {
    0: 'rouge',
    30: 'orange',
    55: 'ambre',
    100: '#8ece34',
    150: 'vert',
    185: 'turquoise',
    215: 'bleu',
    245: '#5d67ee',
    280: 'violet',
    320: 'rose',
  };
  const color =
    avatar.color ??
    (avatar.hue === null ? choose(palette, avatar.seed + ':color') : hues[avatar.hue]);
  return {
    shape,
    color: color.startsWith('#') ? color : COLOR_BY_ID.get(color)!.hex,
    expression: choose(EXPRESSIONS, avatar.seed + ':expression').id,
  };
}
// Still portraits use the native flat renderer: plush tinting requires a browser canvas.
export async function renderAvatar(avatar: OfficeAvatar): Promise<AvatarImage> {
  const markup = await renderToString(() =>
    BloubBot({ ...avatarProfile(avatar), frozenAt: 0, size: 160 }),
  );
  const svg = String(markup)
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace(/\s_hk=(?:"[^"]*"|[^\s>]+)/g, '');
  return { bytes: Buffer.from(svg), mimeType: 'image/svg+xml' };
}
