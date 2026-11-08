import { readdir, readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';
export const templateFiles = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'office.config.json',
  'office.config.example.json',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.prettierrc.json',
  '.prettierignore',
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSE',
  'VERIFICATION.md',
  'Start office.cmd',
  'Stop office.cmd',
  'Connect dashboard.cmd',
  'Edit office.cmd',
  'Start connection proof.cmd',
  'src',
  'ui',
  'office',
  'docs',
  'tests',
  'examples',
  'scripts',
  'public/credits.html',
  'public/assets/custom',
  'public/assets/furniture-3d',
  'public/assets/three-LICENSE.txt',
  '.github',
];
const blocked = (path: string) =>
  /(^|\/)(node_modules|dist|release|\.git)(\/|$)|\.local\.|\.dpapi$|\.log$/.test(path);
export async function collectTemplate(root: string) {
  const files: Record<string, Uint8Array> = {};
  async function walk(path: string) {
    if (blocked(path)) return;
    const full = join(root, path);
    try {
      if ((await lstat(full)).isSymbolicLink()) return;
      const entries = await readdir(full, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        await walk(path + '/' + entry.name);
      }
    } catch (e: any) {
      if (e.code === 'ENOTDIR') files[path.replaceAll('\\', '/')] = await readFile(full);
      else if (e.code !== 'ENOENT') throw e;
    }
  }
  for (const path of templateFiles) await walk(path);
  return files;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = await collectTemplate(root);
  await mkdir(join(root, 'release'), { recursive: true });
  await writeFile(join(root, 'release', 'agent-office-template.zip'), zipSync(files, { level: 6 }));
  console.log(
    `Created release/agent-office-template.zip (${Object.keys(files).length} source files; no local configuration or session data).`,
  );
}
