import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const files: string[] = [];
async function scan(dir: string) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await scan(path);
    else if (item.name.endsWith('.md') && !item.name.includes('.local.')) files.push(path);
  }
}
for (const name of [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'THIRD_PARTY_NOTICES.md',
  'VERIFICATION.md',
])
  files.push(join(root, name));
await scan(join(root, 'docs'));
await scan(join(root, '.github'));
const errors: string[] = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const path = decodeURIComponent(href.split('#')[0]);
    if (!path) continue;
    try {
      await stat(resolve(dirname(file), path));
    } catch {
      errors.push(`${file}: ${href}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Checked local links in ${files.length} Markdown files.`);
