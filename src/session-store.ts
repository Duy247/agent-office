import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export function profileName(value: unknown) {
  const name = typeof value === 'string' ? value : 'default';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name))
    throw new Error('Credential profile must use 1–64 letters, numbers, underscores or hyphens.');
  return name;
}
function protect(value: string, decrypt = false) {
  const script = `Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); ${decrypt ? '[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))' : '[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))'}`;
  const p = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: value,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
  });
  if (p.status !== 0) throw new Error('Windows credential protection failed.');
  return p.stdout.trim();
}
async function entry(profile: string) {
  try {
    const { AsyncEntry } = await import('@napi-rs/keyring');
    return new AsyncEntry('AgentOffice.Openbot', profile, { linux: { store: 'secret-service' } });
  } catch {
    throw new Error(
      'OS credential storage is unavailable. Install the optional keyring package and unlock the system keychain. No plaintext fallback is used.',
    );
  }
}
export async function saveProtectedSession(session: object, profile: unknown = 'default') {
  const name = profileName(profile);
  if (process.platform === 'win32') {
    const dir = join(process.env.LOCALAPPDATA ?? '', 'OpenbotOfficeDashboard');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, name === 'default' ? 'session.dpapi' : `session-${name}.dpapi`),
      protect(JSON.stringify(session)),
      { mode: 0o600 },
    );
  } else await (await entry(name)).setPassword(JSON.stringify(session));
}
export async function loadProtectedSession(profile: unknown = 'default') {
  const name = profileName(profile);
  try {
    if (process.platform === 'win32') {
      const path = join(
        process.env.LOCALAPPDATA ?? '',
        'OpenbotOfficeDashboard',
        name === 'default' ? 'session.dpapi' : `session-${name}.dpapi`,
      );
      return JSON.parse(protect(await readFile(path, 'utf8'), true));
    }
    const value = await (await entry(name)).getPassword();
    if (!value) throw new Error('No saved session');
    return JSON.parse(value);
  } catch {
    throw new Error(
      'No usable protected session. Run npm run connect for this credential profile.',
    );
  }
}
