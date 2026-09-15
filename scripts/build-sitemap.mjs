// Build-time sitemap generator.
//
// razekit.com is a static site, so the sitemap cannot be computed per request.
// It is written here, at build time, from two sources:
//
//   1. the fixed public routes, which are known from the router and always emitted
//   2. the live open contests and published winners, fetched from the API
//
// (2) is best-effort ON PURPOSE. If the API is asleep, slow, or mid-deploy when
// the frontend builds, the correct outcome is a smaller but still-valid sitemap —
// not a failed deploy, and not a sitemap full of URLs invented to fill the gap.
// Every URL emitted here is one the crawler will actually find content at.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ORIGIN = process.env.SITE_ORIGIN || 'https://razekit.com';
const API = process.env.VITE_API_URL || process.env.API_BASE_URL || 'https://razekit-api.onrender.com';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sitemap.xml');

/** Fixed public routes. changefreq/priority are hints, not promises. */
const STATIC = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/discover', priority: '0.9', changefreq: 'daily' },
  { path: '/explore', priority: '0.8', changefreq: 'daily' },
  { path: '/winners', priority: '0.8', changefreq: 'weekly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/contact', priority: '0.5', changefreq: 'monthly' },
  { path: '/help', priority: '0.5', changefreq: 'monthly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
];

const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function callFunction(name, body = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${API}/api/functions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const urls = STATIC.map((s) => ({ loc: ORIGIN + s.path, ...s }));
const notes = [];

// Public contest pages. Only contests a signed-out visitor can actually open.
const showcase = await callFunction('winnersShowcase');
if (showcase && Array.isArray(showcase.winners)) {
  const seen = new Set();
  for (const w of showcase.winners) {
    if (!w?.contest_id || seen.has(w.contest_id)) continue;
    seen.add(w.contest_id);
    urls.push({ loc: `${ORIGIN}/contest/${w.contest_id}`, priority: '0.7', changefreq: 'weekly' });
  }
  notes.push(`${seen.size} contest pages from winnersShowcase`);
} else {
  notes.push('winnersShowcase unreachable — contest pages omitted rather than guessed');
}

const body = urls
  .map((u) => [
    '  <url>',
    `    <loc>${xmlEscape(u.loc)}</loc>`,
    u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
    u.priority ? `    <priority>${u.priority}</priority>` : null,
    '  </url>',
  ].filter(Boolean).join('\n'))
  .join('\n');

writeFileSync(
  OUT,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
  'utf8',
);

console.log(`sitemap: ${urls.length} urls -> public/sitemap.xml`);
for (const n of notes) console.log(`  · ${n}`);
