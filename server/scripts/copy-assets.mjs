// Copies non-TS runtime assets into dist/ after tsc (tsc doesn't copy .json).
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = [['src/entities/schemas.json', 'dist/entities/schemas.json']];

for (const [from, to] of assets) {
  const src = join(root, from);
  const dst = join(root, to);
  if (!existsSync(src)) { console.error(`missing asset: ${from}`); process.exit(1); }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`copied ${from} → ${to}`);
}
