// API surface audit.
//
// The function registry is the whole public attack surface of this API: one
// route, /api/functions/:name, dispatching to whatever HANDLERS contains. Three
// sets decide who may call each one — HTTP_ALLOWED (reachable at all),
// PUBLIC_FUNCTIONS (reachable without a session) and ADMIN_ONLY (gated at the
// route boundary).
//
// Those sets are hand-maintained, which means the realistic failure is not a
// clever attack — it is someone adding a handler and forgetting which list it
// belongs in. This script makes that mistake loud:
//
//   • a handler exposed publicly whose NAME suggests it touches money, admin
//     powers, or another user's data
//   • a name in a gating set that no longer resolves to a handler (a rename
//     that silently un-gated the real function)
//   • an admin handler that is not admin-gated at the route boundary
//   • a handler nobody can reach, which is dead surface worth deleting
//
// It is a lint, not a proof: it reasons about NAMES, and a handler still has to
// do its own ownership checks. It fails the build on a genuine finding so the
// mistake cannot ride along in a commit.
import { HANDLERS, HTTP_ALLOWED, PUBLIC_FUNCTIONS, ADMIN_ONLY } from '../src/functions/registry.js';

const names = Object.keys(HANDLERS).sort();
const problems: string[] = [];
const notes: string[] = [];

/** Name fragments that mean "this touches money or someone's private data". */
const SENSITIVE = [
  'finance', 'ledger', 'payout', 'withdrawal', 'funding', 'refund', 'payment',
  'balance', 'bank', 'settings', 'admin', 'audit', 'fraud', 'trust', 'enforcement',
  'disqualify', 'reinstate', 'verify', 'approve', 'review', 'earnings',
];

/** Public functions that are deliberately public, each with the reason. */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  winnersShowcase: 'finalized winner results — already public on the Winners Hub',
  winnersLeaderboard: 'finalized rankings — already public',
  creatorPublicProfile: 'a creator profile a visitor is meant to be able to read',
  paymentModeInfo: 'says WHICH payment mode is active; names no credential',
  platformStats: 'aggregate seed-excluded counts; nothing identifying',
  pollList: 'the upcoming-tournament banners on the public home page',
  pollVote: 'a visitor may vote; identity is derived server-side, not supplied',
  uropayAvailability: 'whether UPI is available; names no credential',
  uropayWebhook: 'the provider cannot hold a session — gated on an HMAC signature instead',
};

console.log('\n══ RazeKit API surface audit ══\n');
console.log(`  handlers: ${names.length}`);
console.log(`  reachable over HTTP: ${HTTP_ALLOWED.size}`);
console.log(`  public (no session): ${PUBLIC_FUNCTIONS.size}`);
console.log(`  admin-gated at the route: ${ADMIN_ONLY.size}\n`);

// ── Every gated name must still resolve to a real handler ───────────────────
// A rename that updates HANDLERS but not these sets leaves the OLD name gated
// and the NEW one wide open, which is the worst possible direction to fail in.
for (const [label, set] of [['HTTP_ALLOWED', HTTP_ALLOWED], ['PUBLIC_FUNCTIONS', PUBLIC_FUNCTIONS], ['ADMIN_ONLY', ADMIN_ONLY]] as const) {
  for (const n of set) {
    if (!names.includes(n)) problems.push(`${label} names "${n}", which is not a handler — a rename may have left the real function ungated.`);
  }
}

// ── Public functions must be public on purpose ──────────────────────────────
for (const n of PUBLIC_FUNCTIONS) {
  if (!names.includes(n)) continue;
  if (!PUBLIC_BY_DESIGN[n]) {
    problems.push(`"${n}" is PUBLIC but is not on the reviewed public list. If it is genuinely public, add it to PUBLIC_BY_DESIGN with the reason.`);
    continue;
  }
  const hit = SENSITIVE.find((s) => n.toLowerCase().includes(s));
  if (hit) notes.push(`"${n}" is public and its name contains "${hit}" — reviewed and accepted: ${PUBLIC_BY_DESIGN[n]}`);
}

// ── Public functions must also be reachable ─────────────────────────────────
for (const n of PUBLIC_FUNCTIONS) {
  if (names.includes(n) && !HTTP_ALLOWED.has(n)) {
    problems.push(`"${n}" is in PUBLIC_FUNCTIONS but not in HTTP_ALLOWED — it is unreachable, so the public intent is not actually delivered.`);
  }
}

// ── Admin-gated functions must be reachable, and admin names should be gated ─
for (const n of ADMIN_ONLY) {
  if (names.includes(n) && !HTTP_ALLOWED.has(n)) {
    problems.push(`"${n}" is ADMIN_ONLY but not in HTTP_ALLOWED — unreachable.`);
  }
  if (PUBLIC_FUNCTIONS.has(n)) {
    problems.push(`"${n}" is in BOTH ADMIN_ONLY and PUBLIC_FUNCTIONS. That is a contradiction and the public set wins at the boundary.`);
  }
}

// Finance handlers are deliberately NOT in ADMIN_ONLY — they are gated on
// granular finance permissions inside each handler instead. That is a real
// design decision, so the audit states it rather than flagging it forever.
const financeNames = names.filter((n) => n.startsWith('finance'));
notes.push(`${financeNames.length} finance handlers are gated on granular finance permissions inside each handler, not on ADMIN_ONLY — by design.`);

for (const n of names) {
  const looksAdmin = /^admin[A-Z]/.test(n) || n.toLowerCase().includes('adminlist');
  if (looksAdmin && !ADMIN_ONLY.has(n) && HTTP_ALLOWED.has(n)) {
    problems.push(`"${n}" looks like an admin handler but is not in ADMIN_ONLY.`);
  }
}

// ── Dead surface ────────────────────────────────────────────────────────────
const unreachable = names.filter((n) => !HTTP_ALLOWED.has(n));
if (unreachable.length) {
  notes.push(`${unreachable.length} handlers are not reachable over HTTP (internal or worker-only): ${unreachable.join(', ')}`);
}

// ── Report ──────────────────────────────────────────────────────────────────
if (notes.length) {
  console.log('── Reviewed and accepted ──');
  for (const n of notes) console.log('  · ' + n);
  console.log('');
}

if (problems.length) {
  console.log('── PROBLEMS ──');
  for (const p of problems) console.log('  ✘ ' + p);
  console.log(`\n══ ${problems.length} problem(s) ══\n`);
  process.exit(1);
}

console.log(`══ no problems across ${names.length} handlers ══\n`);
process.exit(0);
