import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(ROOT, 'ui');
const DIST = path.join(ROOT, 'dist');

await fs.mkdir(DIST, { recursive: true });
await fs.copyFile(path.join(UI, 'html', 'index.html'), path.join(DIST, 'index.html'));
await Promise.all(['style', 'script', 'data', 'assets'].map((directory) =>
  fs.cp(path.join(UI, directory), path.join(DIST, directory), { recursive: true }),
));
await fs.copyFile(path.join(UI, 'card-back.jpg'), path.join(DIST, 'card-back.jpg'));
console.log(`Built static site at ${DIST}`);