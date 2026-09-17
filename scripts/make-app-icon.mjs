// Generates the square RazeKit app icon.
//
// Why this exists: `apple-touch-icon` and the web manifest both pointed at
// og.png, which is a 1200x630 SOCIAL BANNER. iOS and Android do not letterbox a
// home-screen icon — they crop it to a square — so the banner's middle stripe
// was being used as the app icon and the mark came out cut off. The favicon was
// always correct; the app icon never was.
//
// The geometry is copied from public/favicon.svg, which is the locked mark. Do
// not redraw it here — if the mark ever changes, change favicon.svg and re-run
// this script so the two cannot drift.
//
// sharp is a native module and the production static build must not depend on
// it, so it is installed only when this script is run — the same arrangement
// scripts/make-og-image.mjs already uses.
//
// Usage:  npm i --no-save sharp && node scripts/make-app-icon.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// The locked mark, unchanged from favicon.svg.
const MARK = `
  <g transform="translate(8.73,0) skewX(-20)">
    <rect x="6"  y="30" width="20" height="10" rx="2" fill="url(#a)"/>
    <rect x="14" y="19" width="20" height="10" rx="2" fill="url(#b)"/>
    <rect x="22" y="8"  width="20" height="10" rx="2" fill="url(#c)"/>
  </g>`;

const GRADIENTS = `
  <defs>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b2f5e"/><stop offset="1" stop-color="#0d1b3a"/>
    </linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f7bf5"/><stop offset="1" stop-color="#0f47c2"/>
    </linearGradient>
    <linearGradient id="c" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#31d3ff"/><stop offset="1" stop-color="#1479f5"/>
    </linearGradient>
  </defs>`;

/**
 * `scale` is the share of the canvas the mark occupies.
 *
 * 0.78 for the plain icon. 0.62 for the maskable one, because a maskable icon
 * may be cropped to a circle and anything outside the middle 80% can be cut —
 * the mark is wide and diagonal, so it needs the room.
 */
function icon(scale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  ${GRADIENTS}
  <rect width="48" height="48" rx="0" fill="#070f22"/>
  <g transform="translate(24,24) scale(${scale}) translate(-24,-24)">${MARK}
  </g>
</svg>`;
}

// A transparent icon would be composited onto black by iOS, so the plate is
// explicit. It is deliberately a few steps DARKER than the manifest's
// theme_color (#0d1b3a): the lowest of the three bars ends at that exact navy,
// so plating on the theme colour made the bottom bar vanish into its own
// background. #070f22 keeps all three legible while staying on-brand.
const plain = icon(0.78);
const maskable = icon(0.62);

writeFileSync(join(OUT_DIR, 'app-icon.svg'), plain);
console.log('wrote public/app-icon.svg');

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.log('sharp is not installed, so no PNG was produced.');
  console.log('Run:  npm i --no-save sharp && node scripts/make-app-icon.mjs');
  process.exit(0);
}

// 180 is what Safari asks for; 192 and 512 are the two Android/Chrome expects.
const targets = [
  ['apple-touch-icon.png', 180, plain],
  ['app-icon-192.png', 192, plain],
  ['app-icon-512.png', 512, plain],
  ['app-icon-maskable-512.png', 512, maskable],
];

for (const [name, size, svg] of targets) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ quality: 92 }).toFile(join(OUT_DIR, name));
  console.log(`wrote public/${name} (${size}x${size})`);
}
