// Generates the Open Graph social preview image.
//
// Run locally and COMMIT the PNG. Deliberately not part of `npm run build`:
// sharp is a native module, and making the production static-site build depend
// on one would trade a once-a-year asset refresh for a class of deploy failure
// that only shows up on the build host.
//
// PNG rather than SVG because Facebook, LinkedIn, WhatsApp and X all refuse SVG
// for og:image — an SVG here renders as no preview at all, which is worse than
// a plain one.
//
// Usage:  npm i --no-save sharp && node scripts/make-og-image.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// 1200x630 is the size every major scraper crops to. The safe area is generous
// because WhatsApp and X crop tighter than the nominal ratio.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#070d1c"/>
      <stop offset="0.55" stop-color="#0b1730"/>
      <stop offset="1" stop-color="#0d1b3a"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.18" r="0.62">
      <stop offset="0" stop-color="#2f7bf5" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#2f7bf5" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.1" cy="0.95" r="0.5">
      <stop offset="0" stop-color="#31d3ff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#31d3ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="m1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b2f5e"/><stop offset="1" stop-color="#0d1b3a"/>
    </linearGradient>
    <linearGradient id="m2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f7bf5"/><stop offset="1" stop-color="#0f47c2"/>
    </linearGradient>
    <linearGradient id="m3" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#31d3ff"/><stop offset="1" stop-color="#1479f5"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2f7bf5" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#31d3ff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect width="1200" height="630" fill="url(#glow2)"/>

  <!-- The locked mark: three skewed stacked bars, same geometry as favicon.svg. -->
  <g transform="translate(96,86) scale(1.9)" >
    <g transform="skewX(-20)">
      <rect x="6"  y="30" width="20" height="10" rx="2" fill="url(#m1)"/>
      <rect x="14" y="19" width="20" height="10" rx="2" fill="url(#m2)"/>
      <rect x="22" y="8"  width="20" height="10" rx="2" fill="url(#m3)"/>
    </g>
  </g>
  <text x="200" y="152" font-family="Inter Tight, Inter, Segoe UI, sans-serif"
        font-size="52" font-weight="800" letter-spacing="-1.6" fill="#ffffff">Raze<tspan fill="#4f9bff">kit</tspan></text>

  <rect x="96" y="214" width="380" height="3" rx="1.5" fill="url(#rule)"/>

  <text x="96" y="318" font-family="Inter Tight, Inter, Segoe UI, sans-serif"
        font-size="76" font-weight="800" letter-spacing="-2.6" fill="#ffffff">Creator contests,</text>
  <text x="96" y="404" font-family="Inter Tight, Inter, Segoe UI, sans-serif"
        font-size="76" font-weight="800" letter-spacing="-2.6" fill="#8fbcff">judged on performance.</text>

  <text x="96" y="470" font-family="Inter, Segoe UI, sans-serif"
        font-size="27" font-weight="400" fill="#9db4d8">Brands fund a brief. Creators compete. The work is measured, and the winner is paid.</text>

  <g font-family="Inter, Segoe UI, sans-serif" font-size="21" font-weight="600" fill="#cfe0fb">
    <rect x="96"  y="518" width="196" height="50" rx="25" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.14"/>
    <text x="123" y="550">Funded prizes</text>
    <rect x="312" y="518" width="238" height="50" rx="25" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.14"/>
    <text x="339" y="550">Measured performance</text>
    <rect x="570" y="518" width="190" height="50" rx="25" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.14"/>
    <text x="597" y="550">Public winners</text>
  </g>

  <text x="1104" y="556" text-anchor="end" font-family="Inter, Segoe UI, sans-serif"
        font-size="23" font-weight="600" fill="#5f7ba6">razekit.com</text>
</svg>`;

writeFileSync(join(OUT_DIR, 'og.svg'), svg, 'utf8');

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.log('og.svg written. sharp is not installed, so no PNG was produced.');
  console.log('Run:  npm i --no-save sharp && node scripts/make-og-image.mjs');
  process.exit(0);
}

await sharp(Buffer.from(svg)).png({ quality: 92 }).toFile(join(OUT_DIR, 'og.png'));
console.log('wrote public/og.png (1200x630) and public/og.svg');
