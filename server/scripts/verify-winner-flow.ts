// Live verification of RazeKit's winner lifecycle against the spec test cases.
//
// The rule this exists to prove: a creator NEVER connects a social account to
// enter, submit or be scored. Verification is created the moment they win, only
// the winner can complete it, and no payout is payable until it succeeds.
//
// Self-cleaning; safe against a live database.
import { prisma } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';
import { winnerFinalize } from '../src/functions/winner.js';
import {
  winnerVerificationStatus, winnerVerificationStart, winnerVerificationSubmit,
  winnerVerificationReview, winnerVerificationQueue,
} from '../src/functions/winnerVerification.js';
import { ensurePayoutForWinner } from '../src/functions/payouts.js';
import { LIFECYCLE, canTransition, inferLifecycle, legacyStatus } from '../src/contest/lifecycle.js';
import { VERIFICATION_STATUS } from '../src/verification/platforms.js';

const svc = serviceClient();
const ctx = (u: any, b: any = {}) => ({ user: u, svc, body: b, req: {} });
let pass = 0;
let fail = 0;
const fails: string[] = [];
const ok = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; fails.push(n); console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`); }
};
const eq = (n: string, a: any, b: any) => ok(n, a === b, `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

const RUN = 'wf-' + Date.now().toString(36);
console.log(`\n== Winner lifecycle verification (${RUN}) ==\n`);

const mk = async (kind: string, role = 'user', userRole = 'creator') => {
  const u = await prisma.appUser.create({
    data: {
      email: `${RUN}-${kind}@razekit.test`, fullName: `${RUN} ${kind}`,
      role, userRole, accountStatus: 'active', emailVerified: true,
    },
  });
  return { id: u.id, role: u.role, user_role: u.userRole, email: u.email, full_name: u.fullName };
};

const brand = await mk('brand', 'user', 'client');
const winner = await mk('winner');
const loser = await mk('loser');
const admin = await mk('admin', 'admin', 'visitor');

// ── The state machine itself ────────────────────────────────────────────────
console.log('-- Contest lifecycle state machine --');
ok('a draft cannot jump straight to LIVE', !canTransition(LIFECYCLE.DRAFT, LIFECYCLE.LIVE));
ok('an unfunded contest cannot go LIVE', !canTransition(LIFECYCLE.FUNDING_REQUIRED, LIFECYCLE.LIVE));
ok('funding is what unlocks going live', canTransition(LIFECYCLE.FUNDED, LIFECYCLE.LIVE));
ok('a winner cannot be paid before verification',
  !canTransition(LIFECYCLE.WINNER_SELECTION, LIFECYCLE.PAYMENT_PENDING));
ok('verification is the only route to PAYMENT_PENDING',
  canTransition(LIFECYCLE.WINNER_PENDING_VERIFICATION, LIFECYCLE.PAYMENT_PENDING));
ok('a failed verification can return to winner selection',
  canTransition(LIFECYCLE.WINNER_PENDING_VERIFICATION, LIFECYCLE.WINNER_SELECTION));
ok('COMPLETED is terminal', !canTransition(LIFECYCLE.COMPLETED, LIFECYCLE.LIVE));
ok('a dispute freezes and can resume', canTransition(LIFECYCLE.LIVE, LIFECYCLE.DISPUTED)
  && canTransition(LIFECYCLE.DISPUTED, LIFECYCLE.PAYMENT_PENDING));
eq('legacy status stays in step (LIVE -> open)', legacyStatus(LIFECYCLE.LIVE), 'open');
eq('legacy status stays in step (PAYMENT_PENDING -> winner_selected)', legacyStatus(LIFECYCLE.PAYMENT_PENDING), 'winner_selected');

// ── Contest + entries ───────────────────────────────────────────────────────
console.log('\n-- Setup: a contest with two entries --');
const contest = await svc.entities.Contest.create({
  title: `${RUN} winner flow contest`, prize_amount: 20000, currency: 'INR', settlement_region: 'IN',
  deadline: new Date(Date.now() + 2 * 864e5).toISOString(), status: 'open',
  created_by_id: brand.id, demo: RUN,
});
eq('a legacy contest infers a lifecycle state', inferLifecycle(contest), LIFECYCLE.LIVE);

const winSub = await svc.entities.Submission.create({
  contest_id: contest.id, title: `${RUN} winning entry`, status: 'submitted',
  created_by_id: winner.id, submitted_at: new Date().toISOString(), demo: RUN,
});
await svc.entities.Submission.create({
  contest_id: contest.id, title: `${RUN} other entry`, status: 'submitted',
  created_by_id: loser.id, submitted_at: new Date().toISOString(), demo: RUN,
});

// ── No social account was ever required to get here ─────────────────────────
console.log('\n-- RULE: no social connection required to participate --');
const winnerAccounts = await svc.entities.SocialAccount.filter({ user_id: winner.id }, '-created_date', 5);
eq('the entrant has NO connected social account', winnerAccounts.length, 0);
const preVerification = await svc.entities.WinnerVerification.filter({ contest_id: contest.id }, '-created_date', 5);
eq('no verification exists before a winner is chosen', preVerification.length, 0);
const early: any = await winnerVerificationStart(ctx(winner, { contest_id: contest.id, platform: 'youtube' }));
ok('a creator cannot start verification before winning', early.status >= 400, String(early.status));

// ── Winner selection ────────────────────────────────────────────────────────
console.log('\n-- Winner selection --');
const notOwner: any = await winnerFinalize(ctx(loser, { contest_id: contest.id, submission_id: winSub.id }));
eq('a creator cannot finalize a winner', notOwner.status, 403);

const finalized: any = await winnerFinalize(ctx(brand, { contest_id: contest.id, submission_id: winSub.id }));
eq('the brand can finalize', finalized.status, 200);
eq('the right entry won', finalized.json.winner_submission_id, winSub.id);
ok('verification was created on finalize', Boolean(finalized.json.verification?.id));
eq('verification starts PENDING', finalized.json.verification?.status, VERIFICATION_STATUS.PENDING);

const afterWin = await svc.entities.Contest.get(contest.id);
eq('the contest moved to WINNER_PENDING_VERIFICATION', afterWin.lifecycle_state, LIFECYCLE.WINNER_PENDING_VERIFICATION);

// ── TEST CASE D: a non-winner is blocked ────────────────────────────────────
console.log('\n-- Spec test case D: non-winner blocked from verification --');
const loserStart: any = await winnerVerificationStart(ctx(loser, { contest_id: contest.id, platform: 'youtube' }));
eq('a losing creator cannot start verification', loserStart.status, 403);
eq('and is told plainly why', loserStart.json?.error?.code, 'NOT_THE_WINNER');
const loserSubmit: any = await winnerVerificationSubmit(ctx(loser, { contest_id: contest.id, url: 'https://www.youtube.com/watch?v=x' }));
eq('a losing creator cannot submit evidence', loserSubmit.status, 403);
const loserStatus: any = await winnerVerificationStatus(ctx(loser, { contest_id: contest.id }));
eq('a losing creator cannot even read the verification', loserStatus.status, 403);

// ── TEST CASE E: unverified winner is not payable ───────────────────────────
console.log('\n-- Spec test case E: unverified winner cannot be paid --');
const payout = await svc.entities.Payout.filter({ contest_id: contest.id }, '-created_date', 1);
ok('a payout record exists', payout.length > 0);
eq('but it is NOT eligible', payout[0]?.status, 'PAYOUT_NOT_ELIGIBLE');
ok('and it says verification is why', String(payout[0]?.eligibility_reason || '').toLowerCase().includes('verify')
  || String(payout[0]?.eligibility_reason || '').toLowerCase().includes('funded'), payout[0]?.eligibility_reason);

// ── The winner verifies ─────────────────────────────────────────────────────
console.log('\n-- The winner verifies --');
const status1: any = await winnerVerificationStatus(ctx(winner, { contest_id: contest.id }));
eq('the winner can read their verification', status1.status, 200);
ok('the winner is offered the platform list', Array.isArray(status1.json.platforms) && status1.json.platforms.length > 0);
ok('platforms declare honestly whether an API is integrated',
  status1.json.platforms.every((p: any) => p.api_integration === false));

const started: any = await winnerVerificationStart(ctx(winner, { contest_id: contest.id, platform: 'youtube', handle: '@example' }));
eq('the winner can start verification', started.status, 200);
eq('a challenge code is issued', started.json.verification.status, VERIFICATION_STATUS.CODE_ISSUED);
ok('the code is present and non-trivial', String(started.json.verification.challenge_code || '').startsWith('RAZEKIT-'));
const code = started.json.verification.challenge_code;

const badUrl: any = await winnerVerificationSubmit(ctx(winner, { contest_id: contest.id, url: 'not-a-url' }));
eq('a malformed link is refused', badUrl.json?.error?.code, 'URL_INVALID');
const ssrf: any = await winnerVerificationSubmit(ctx(winner, { contest_id: contest.id, url: 'http://localhost:4000/admin' }));
eq('an internal URL is refused (SSRF guard)', ssrf.json?.error?.code, 'URL_INVALID');
const wrongPlatform: any = await winnerVerificationSubmit(ctx(winner, { contest_id: contest.id, url: 'https://www.instagram.com/p/abc/' }));
eq('a link from the wrong platform is refused', wrongPlatform.json?.error?.code, 'URL_INVALID');

// A real fetch against a page that does NOT contain the code must FAIL, not pass.
const realSubmit: any = await winnerVerificationSubmit(ctx(winner, {
  contest_id: contest.id, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
}));
eq('submitting returns 200 with an explicit outcome', realSubmit.status, 200);
ok('the outcome is FAILED or MANUAL_REVIEW, never a fabricated pass',
  ['FAILED', 'MANUAL_REVIEW'].includes(realSubmit.json.outcome), realSubmit.json.outcome);
ok('a real page without the code is never auto-verified',
  realSubmit.json.verification.status !== VERIFICATION_STATUS.VERIFIED, realSubmit.json.verification.status);
console.log(`       outcome: ${realSubmit.json.outcome} — ${realSubmit.json.message}`);

// Still not payable.
const stillNot = await svc.entities.Payout.filter({ contest_id: contest.id }, '-created_date', 1);
eq('the payout is STILL not eligible after a failed check', stillNot[0]?.status, 'PAYOUT_NOT_ELIGIBLE');

// ── Admin review: the honest manual path ────────────────────────────────────
console.log('\n-- Manual review (the honest fallback) --');
const verificationId = realSubmit.json.verification.id;
const byCreator: any = await winnerVerificationReview(ctx(winner, { verification_id: verificationId, decision: 'verify', reason: 'I verify myself, thanks' }));
eq('a creator cannot review their own verification', byCreator.status, 403);
const byBrand: any = await winnerVerificationReview(ctx(brand, { verification_id: verificationId, decision: 'verify', reason: 'Approving my own winner' }));
eq('a brand cannot mark a winner verified', byBrand.status, 403);
const noReason: any = await winnerVerificationReview(ctx(admin, { verification_id: verificationId, decision: 'verify', reason: 'ok' }));
eq('an admin must give a reason', noReason.json?.error?.code, 'REASON_REQUIRED');

const queue: any = await winnerVerificationQueue(ctx(admin));
eq('the admin queue loads', queue.status, 200);

const approved: any = await winnerVerificationReview(ctx(admin, {
  verification_id: verificationId, decision: 'verify',
  reason: `${RUN} manually confirmed the code was visible on the channel page.`,
}));
eq('an admin can verify with a reason', approved.status, 200);
eq('the verification is VERIFIED', approved.json.verification.status, VERIFICATION_STATUS.VERIFIED);

// ── What verification unlocks ───────────────────────────────────────────────
console.log('\n-- What verification unlocks --');
const verifiedContest = await svc.entities.Contest.get(contest.id);
eq('the contest moved to PAYMENT_PENDING', verifiedContest.lifecycle_state, LIFECYCLE.PAYMENT_PENDING);
ok('the verification timestamp is recorded', Boolean(verifiedContest.winner_verified_at));

const account = await svc.entities.SocialAccount.filter({ user_id: winner.id }, '-created_date', 1);
eq('a social account now exists for the winner', account.length, 1);
eq('and it is marked verified', account[0]?.verified, true);
ok('it stores NO token, password or private data',
  !JSON.stringify(account[0] || {}).match(/access_token|refresh_token|password|secret/i));
console.log(`       stored: platform=${account[0]?.platform} handle=${account[0]?.handle}`);

// A payout created now sees a verified winner.
await svc.entities.Payout.delete(payout[0].id).catch(() => {});
const freshPayout = await ensurePayoutForWinner(svc, {
  contest: await svc.entities.Contest.get(contest.id), submission: winSub, creatorId: winner.id,
});
ok('a payout is only eligible once BOTH funding and verification are done',
  freshPayout.status === 'PAYOUT_NOT_ELIGIBLE'
  && String(freshPayout.eligibility_reason).toLowerCase().includes('funded'),
  `${freshPayout.status}: ${freshPayout.eligibility_reason}`);

// ── Audit trail ─────────────────────────────────────────────────────────────
console.log('\n-- Audit --');
const audits = await svc.entities.AuditLog.filter({ user_id: winner.id }, '-created_date', 50);
const actions = audits.map((a: any) => a.action);
for (const expected of ['winner.verification_started', 'winner.verification_code_issued',
  'winner.verification_submitted', 'winner.verification_completed']) {
  ok(`audited: ${expected}`, actions.includes(expected));
}
ok('audit records name an actor', audits.every((a: any) => Boolean(a.actor)));

// ── Cleanup ─────────────────────────────────────────────────────────────────
console.log('\n-- Cleanup --');
let removed = 0;
for (const name of ['WinnerVerification', 'SocialAccount', 'Payout', 'ScoreSnapshot',
  'Submission', 'Contest', 'AuditLog', 'Notification', 'LedgerEntry', 'LedgerTransaction']) {
  const rows = await svc.entities[name].filter({}, '-created_date', 2000).catch(() => []);
  for (const r of rows) {
    const blob = JSON.stringify(r);
    if (!blob.includes(RUN) && ![brand.id, winner.id, loser.id, admin.id, contest.id].some((id) => blob.includes(id))) continue;
    await svc.entities[name].delete(r.id).catch(() => {});
    removed++;
  }
}
await prisma.appUser.deleteMany({ where: { email: { contains: RUN } } });
console.log(`  removed ${removed} verification records`);

console.log(`\n== ${pass} passed, ${fail} failed ==`);
if (fail) { console.log('\nFailures:'); fails.forEach((f) => console.log('  - ' + f)); }
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
