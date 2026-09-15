// LIVE verification of campaign image generation, against PRODUCTION.
//
// Everything here goes through the deployed HTTPS API rather than in-process,
// which is the entire point: only the deployed service knows what IMAGE_DRIVER
// and OPENAI_API_KEY are set to. Running the generation locally would exercise
// this machine's configuration and prove nothing about production.
//
// It creates ONE contest, which fires exactly ONE generation through the
// onContestCreated hook, and deletes everything afterwards. It never generates
// a second image: a paid call made twice to be sure is a paid call wasted.
//
// It reads the resulting row directly from the production database to check
// what was actually persisted, because the API's response is a claim and the
// row is the fact.
import { prisma } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';

const API = process.env.VERIFY_API || 'https://razekit-api.onrender.com';
const svc = serviceClient();

let pass = 0; let fail = 0;
const fails: string[] = [];
const ok = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; fails.push(n); console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`); }
};
const eq = (n: string, a: any, b: any) => ok(n, a === b, `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

const RUN = 'imgv-' + Date.now().toString(36);
const EMAIL = `${RUN}@razekit.test`;
// A throwaway password for a throwaway account that is deleted at the end. It
// is generated, never reused, and never printed.
const PASSWORD = 'Vf' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + '!9';

console.log(`\n══ LIVE image generation verification (${RUN}) ══`);
console.log(`   target: ${API}\n`);

async function api(path: string, { method = 'POST', body = null as any, token = '' } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => '');
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

// ── 1. A throwaway account, created through the public API ──────────────────
console.log('── Session ──');
const reg = await api('/api/auth/register', { body: { email: EMAIL, password: PASSWORD, full_name: `${RUN} verifier` } });
ok('a verification account can be registered', reg.status < 400, `status ${reg.status} ${JSON.stringify(reg.json).slice(0, 120)}`);

let token: string = reg.json?.access_token || '';
if (!token) {
  const login = await api('/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  token = login.json?.access_token || '';
  ok('and can sign in', Boolean(token), `status ${login.status}`);
}

if (!token) {
  console.log('\n  Cannot continue without a session. Nothing was generated.');
  await cleanup();
  finish();
}

// The account must choose the client surface before it may create a contest.
const role = await api('/api/auth/me', { method: 'PATCH', body: { user_role: 'client', onboarding_completed: true }, token });
ok('the account can take the client role through onboarding', role.status < 400, `status ${role.status}`);

// ── 2. ONE contest → exactly ONE generation, using PRODUCTION's config ──────
console.log('\n── Triggering one generation ──');
// A 10,000 prize allows a 1-3 day contest, and the server rounds the span up.
// 2 days sits safely inside the band — the fairness rule is server-enforced and
// correctly refused a 4-day span on the first attempt.
const deadline = new Date(Date.now() + 2 * 864e5).toISOString();
const created = await api('/api/entities/Contest', {
  body: {
    title: `${RUN} image verification campaign`,
    // A cinematic brief, so a real provider has something to work with and the
    // result is recognisable as art direction rather than noise.
    brief: 'A cinematic night-city campaign: wet streets, deep blue shadows, a single warm light source, strong foreground-to-background depth. Premium advertising composition with negative space for a headline.',
    description: 'Live verification of the campaign image pipeline.',
    category: 'Brand Film',
    prize_amount: 10000,
    currency: 'INR',
    settlement_region: 'IN',
    deadline,
    status: 'draft',
    demo: RUN,
  },
  token,
});
ok('a contest was created', created.status < 400, `status ${created.status} ${JSON.stringify(created.json).slice(0, 160)}`);
var contestId: string | undefined = created.json?.id;
ok('and it has an id', Boolean(contestId));

if (!contestId) { await cleanup(); finish(); }

// ── 3. Wait for the generation the hook fired ───────────────────────────────
console.log('\n── Waiting for the generation ──');
let asset: any = null;
const deadlineAt = Date.now() + 180_000;
while (Date.now() < deadlineAt) {
  const rows = await svc.entities.VisualAsset.filter({ entity_id: contestId }, '-created_date', 3).catch(() => []);
  const row = rows[0];
  if (row && (row.status === 'ready' || row.status === 'failed')) { asset = row; break; }
  await new Promise((r) => setTimeout(r, 5000));
}
ok('a VisualAsset row was produced within the timeout', Boolean(asset));

if (!asset) {
  const jobs = await svc.entities.VisualGenerationJob.filter({ entity_id: contestId }, '-created_date', 3).catch(() => []);
  console.log('  last job state:', JSON.stringify(jobs[0] || null).slice(0, 240));
  await cleanup();
  finish();
}

let meta: any = {};
try { meta = JSON.parse(asset.metadata || '{}'); } catch { /* metadata is advisory */ }

console.log(`  provider=${asset.provider} model=${asset.model} status=${asset.status} mime=${asset.mime_type}`);
console.log(`  key=${asset.storage_key}`);
console.log(`  url=${String(asset.storage_url || '').slice(0, 96)}`);
if (asset.error_code) console.log(`  error=${asset.error_code} ${String(asset.error_message || '').slice(0, 160)}`);

// ── 4. What actually got persisted ──────────────────────────────────────────
console.log('\n── Persisted record ──');
const url = String(asset.storage_url || '');
eq('status is ready', asset.status, 'ready');
ok('placeholder is FALSE — this is provider output, not the local stub',
  meta.placeholder === false, `metadata.placeholder=${JSON.stringify(meta.placeholder)}`);
ok('the stored URL is NOT a data: URI', !url.startsWith('data:'), url.slice(0, 60));
ok('the stored URL is NOT a temporary provider URL',
  !/oaidalleapi|openai\.com|blob\.core\.windows/.test(url), url.slice(0, 60));
ok('the mime type is a real raster image, not SVG',
  ['image/png', 'image/jpeg', 'image/webp'].includes(String(asset.mime_type)),
  String(asset.mime_type));
ok('the storage key is versioned with a real extension',
  /\/v\d+\.(png|jpg|jpeg|webp)$/.test(String(asset.storage_key)), String(asset.storage_key));
ok('a byte size was recorded', Number(asset.file_size) > 0, String(asset.file_size));
ok('the model recorded is a real one, not the old placeholder string',
  asset.model && asset.model !== 'openai-image-auto', String(asset.model));

// ── 5. The object is genuinely retrievable from storage ─────────────────────
console.log('\n── Storage ──');
if (/^https?:\/\//.test(url)) {
  const head = await fetch(url).catch(() => null);
  ok('the stored URL actually serves a file', Boolean(head && head.ok), head ? `status ${head.status}` : 'unreachable');
  if (head && head.ok) {
    const buf = Buffer.from(await head.arrayBuffer());
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isWebp = buf.subarray(0, 4).toString('ascii') === 'RIFF';
    ok('and the bytes it serves pass magic-byte validation', isPng || isJpg || isWebp,
      `first bytes ${buf.subarray(0, 4).toString('hex')}`);
    ok('and the served size matches what was recorded',
      Math.abs(buf.length - Number(asset.file_size || 0)) < 1024,
      `served ${buf.length}, recorded ${asset.file_size}`);
  }
} else {
  ok('the stored URL actually serves a file', false, 'not an http(s) URL');
}

// ── 6. Nothing sensitive leaked into the record ─────────────────────────────
console.log('\n── Leakage ──');
const blob = JSON.stringify(asset);
ok('no API key shape appears in the stored record', !/sk-[A-Za-z0-9_-]{16,}/.test(blob));
ok('no data: URI is embedded anywhere in the record', !blob.includes('data:image'));
ok('no connection string appears in the stored record', !/postgres(ql)?:\/\/[^"]*:[^"]*@/.test(blob));

// ── Cleanup ─────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log('\n── Cleanup ──');
  let removed = 0;
  const cid = typeof contestId === 'string' ? contestId : null; // may be undefined on an early exit
  for (const name of ['VisualAsset', 'VisualGenerationJob', 'Contest']) {
    const rows = await svc.entities[name].filter({}, '-created_date', 500).catch(() => []);
    for (const r of rows) {
      const b = JSON.stringify(r);
      if (!b.includes(RUN) && !(cid && b.includes(cid))) continue;
      await svc.entities[name].delete(r.id).catch(() => {});
      removed++;
    }
  }
  const users = await prisma.appUser.deleteMany({ where: { email: { contains: RUN } } }).catch(() => ({ count: 0 }));
  console.log(`  removed ${removed} records and ${users.count} account(s)`);
}

function finish(): never {
  console.log(`\n══ ${pass} passed, ${fail} failed ══`);
  if (fail) { console.log('\nFailures:'); fails.forEach((f) => console.log('  - ' + f)); }
  prisma.$disconnect().finally(() => process.exit(fail ? 1 : 0));
  // Unreachable, but satisfies the never-returning contract.
  throw new Error('exiting');
}

await cleanup();
finish();
