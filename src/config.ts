import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
export const projectRoot = fileURLToPath(new URL('..', import.meta.url));
export function mergeConfig(base: any, local: any): any {
  const out = { ...base };
  for (const [key, value] of Object.entries(local ?? {}))
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? mergeConfig(base?.[key] ?? {}, value)
        : value;
  return out;
}
export async function readSettings(root = projectRoot, includeCLI = true) {
  const base = JSON.parse(await readFile(join(root, 'office.config.json'), 'utf8'));
  let local = {};
  try {
    local = JSON.parse(await readFile(join(root, 'office.config.local.json'), 'utf8'));
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw new Error('office.config.local.json is not valid JSON.');
  }
  const config = mergeConfig(base, local),
    args = includeCLI ? process.argv.slice(2) : [],
    arg = (name: string) => {
      const i = args.indexOf(name);
      return i < 0 ? undefined : args[i + 1];
    };
  if (arg('--port')) config.port = Number(arg('--port'));
  if (arg('--connector')) config.connector = { ...config.connector, type: arg('--connector') };
  if (arg('--server'))
    config.connector = {
      ...config.connector,
      options: { ...config.connector?.options, baseUrl: arg('--server') },
    };
  if (arg('--profile'))
    config.connector = {
      ...config.connector,
      options: { ...config.connector?.options, profile: arg('--profile') },
    };
  return config;
}
export async function updateLocalConfig(patch: any, root = projectRoot) {
  let local = {};
  const path = join(root, 'office.config.local.json');
  try {
    local = JSON.parse(await readFile(path, 'utf8'));
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
  const text = JSON.stringify(mergeConfig(local, patch), null, 2) + '\n';
  try {
    if ((await readFile(path, 'utf8')) === text) return;
  } catch {}
  await writeFile(path, text);
}
