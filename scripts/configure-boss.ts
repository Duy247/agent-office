import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readSettings, updateLocalConfig } from '../src/config.ts';
const rl = createInterface({ input: stdin, output: stdout });
try {
  const settings = await readSettings();
  const name =
    (await rl.question(`Boss name [${settings.boss?.name ?? 'Boss'}]: `)).trim() ||
    settings.boss?.name ||
    'Boss';
  let gender = '';
  while (!['male', 'female'].includes(gender)) {
    gender =
      (await rl.question(`Gender: male or female [${settings.boss?.gender ?? 'male'}]: `))
        .trim()
        .toLowerCase() ||
      settings.boss?.gender ||
      'male';
    if (!['male', 'female'].includes(gender)) console.log('Enter male or female.');
  }
  await updateLocalConfig({ boss: { enabled: true, name, gender } });
  console.log('Boss profile saved locally. Restart the office to apply it.');
} finally {
  rl.close();
}
