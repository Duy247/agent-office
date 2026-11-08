import type { OfficeAvatar } from './shared.ts';

export function publicAvatar(raw: any): OfficeAvatar | undefined {
  if (!raw || typeof raw.seed !== 'string' || !/^[a-z0-9:-]{1,128}$/.test(raw.seed)) return;
  const avatar: OfficeAvatar = {
    seed: raw.seed,
    hue: [0, 30, 55, 100, 150, 185, 215, 245, 280, 320].includes(raw.hue) ? raw.hue : null,
  };
  if (typeof raw.color === 'string' && /^#[a-f0-9]{6}$/i.test(raw.color))
    avatar.color = raw.color.toLowerCase();
  if (typeof raw.version === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(raw.version))
    avatar.version = raw.version;
  return avatar;
}
export function rosterAvatar(raw: any) {
  const avatar = publicAvatar({ seed: raw.avatarSeed, hue: raw.avatarHue, color: raw.avatarColor });
  if (!avatar) return;
  try {
    const u = new URL(raw.avatarUrl);
    if (
      u.protocol === 'openbot-avatar:' &&
      u.hostname === 'agent' &&
      decodeURIComponent(u.pathname.slice(1)) === raw.id &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(u.searchParams.get('v') ?? '')
    )
      avatar.version = u.searchParams.get('v')!;
  } catch {
    /* Generated avatar or no uploaded image. */
  }
  return avatar;
}

export const avatarKey = (avatar: OfficeAvatar) =>
  JSON.stringify([avatar.seed, avatar.hue, avatar.color ?? '', avatar.version ?? '']);
