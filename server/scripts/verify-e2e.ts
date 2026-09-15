// One run of the WHOLE RazeKit marketplace chain, against the real database and
// the real handlers.
//
// The other verify-* scripts each prove one segment: verify-beta-payments the
// money, verify-winner-flow the winner lifecycle, verify-campaigns the six
// campaign records. Each is correct on its own and none of them can catch the
// failure that actually costs a person money — a handoff between segments. A
// contest that goes live on an unverified claim, a winner published with the
// campaign cover instead of the entry that won, a payout debited when it was
// merely requested: every one of those lives in the seam, not in a segment.
//
// So this script runs the seams. A client registers, funds through the MANUAL
// BETA path (the only path that works without provider credentials), an admin
// verifies real money, a creator joins and submits a real Instagram post URL,
// compliance decides eligibility, the engine scores measured engagement and
// measured traffic, the SERVER picks the winner, and the prize leaves only when
// a person confirms the transfer.
//
// What it refuses to do:
//   • invent a metric. Brand Traffic comes from real recordClick() calls
//     through the real fraud classifier, not from a number typed into a column.
//   • assert only the happy path. The assertions that matter here are the
//     negative ones: zero balance before verification, no debit at request,
//     no client-set winner, no cross-creator earnings.
//   • skip a step it cannot complete. A missing dependency FAILS loudly with
//     the reason the handler gave, and is never stubbed past.
//
// Self-cleaning: every record it creates is removed, the platform's own ledger
// accounts are put back exactly as they were found, and the last assertions
// prove the cleanup worked.
import { prisma, ensureFinanceConstraints } from '../src/db.js';
import { serviceClient, makeEntities, userCtx } from '../src/entities/service.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { signToken, verifyToken } from '../src/auth/tokens.js';
import { criteriaConfirm, criteriaGet } from '../src/functions/criteria.js';
import { fundingInstructions, fundingReportTransfer, fundingStatus } from '../src/functions/funding.js';
import { financeVerifyFunding, financeReconcile } from '../src/functions/finance.js';
import { complianceEvaluate } from '../src/functions/compliance.js';
import { trackingLinkCreate } from '../src/functions/tracking.js';
import { recordClick } from '../src/traffic/service.js';
import { computeContestScores } from '../src/scoring/compute.js';
import { weightedFinalScore, DEFAULT_CONFIG } from '../src/scoring/weights.js';
import { SCORE_STATES, SCORING_VERSION } from '../src/scoring/index.js';
import { winnerFinalize } from '../src/functions/winner.js';
import { winnerVerificationStart, winnerVerificationReview, winnerVerificationStatus } from '../src/functions/winnerVerification.js';
import { payoutAccountSave, payoutOverview } from '../src/functions/payouts.js';
import {
  withdrawalRequest, financeWithdrawalReview, financeWithdrawalApprove,
  financeWithdrawalTransferSent, financeWithdrawalConfirm,
} from '../src/functions/withdrawals.js';
import { balanceOverview } from '../src/functions/balance.js';
import { notificationFeed } from '../src/functions/notifications.js';
import { trackerCampaignDetail, trackerCreatorContests, trackerCreatorOverview } from '../src/functions/tracker.js';
import { razekitBalance } from '../src/finance/balances.js';
import { balanceOf, getOrCreateAccount, replayBalance, ACCOUNT_CLASS } from '../src/ledger/accounts.js';
import { FUNDING } from '../src/payments/states.js';
import { PROTECTED_FIELDS } from '../src/entities/protected.js';
import { LIFECYCLE } from '../src/contest/lifecycle.js';
import { VERIFICATION_STATUS } from '../src/verification/platforms.js';
import { ELIGIBILITY } from '../src/compliance/engine.js';
import { parsePublicationUrl, URL_STATUS } from '../src/social/publication.js';
import { toMajor, toMinor } from '../src/money/core.js';

const svc = serviceClient();
const ctx = (u: any, b: any = {}, r: any = {}) => ({ user: u, svc, body: b, req: r });

let pass = 0;
let fail = 0;
const fails: string[] = [];
const ok = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; fails.push(n + (d ? ` — ${d}` : '')); console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`); }
};
const eq = (n: string, a: any, b: any) => ok(n, a === b, `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
/** The code a handler returned, so a failure detail is something a human can act on. */
const why = (r: any) => `status ${r?.status} ${JSON.stringify(r?.json?.error?.code ?? r?.json?.error ?? '')}`;

const RUN = 'e2e-' + Date.now().toString(36);
const PRIZE_MAJOR = 50000;                       // Tier B: a 50,000 prize may run 1-7 days
const PRIZE_MINOR = toMinor(PRIZE_MAJOR, 'INR');
const COVER = `https://cdn.example.com/${RUN}/campaign-cover.jpg`;
const WINNER_ASSET = `https://cdn.example.com/${RUN}/winning-entry.mp4`;
const RIVAL_ASSET = `https://cdn.example.com/${RUN}/rival-entry.mp4`;
const WINNER_POST = 'https://www.instagram.com/reel/RKe2eWinningPost/';
const RIVAL_POST = 'https://www.instagram.com/reel/RKe2eRivalPost01/';
const NOCAP_POST = 'https://www.instagram.com/p/RKe2eNoCaption1/';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

console.log(`\n== RazeKit end-to-end marketplace verification (${RUN}) ==\n`);

// Every id this run touches, so cleanup can recognise its own records and the
// final count can prove none survived.
const owned: string[] = [];
const own = <T extends { id: string }>(row: T): T => { if (row?.id) owned.push(row.id); return row; };

// Entities this run can write into, most-dependent first so a delete never
// orphans something that still points at it.
const ENTITIES = [
  'LedgerEntry', 'LedgerTransaction', 'LedgerAccount', 'FundingReceipt', 'FundingProof',
  'ReconciliationRecord', 'ContestFunding', 'WithdrawalRequest', 'Payout', 'PayoutAccount',
  'Wallet', 'WalletLedgerEntry', 'WinnerVerification', 'SocialAccount', 'WinnerPublish',
  'ScoreSnapshot', 'SubmissionComplianceFinding', 'SubmissionCompliance', 'ComplianceReview',
  'ContestCriterion', 'ContestCriteriaVersion', 'AgentRun', 'TrafficEvent', 'TrackingLink',
  'SocialCampaignPost', 'Submission', 'Contest', 'Notification', 'AuditLog',
];

/**
 * Count (or remove) every record this run is responsible for.
 *
 * A record belongs to the run if it carries the run marker or references an id
 * the run created. Deliberately conservative: an unrecognised row is left alone
 * rather than deleted on a guess, because this runs against a live database.
 */
async function sweep(remove: boolean) {
  const markers = [RUN, ...owned].filter(Boolean);
  let count = 0;
  for (const name of ENTITIES) {
    const rows = await svc.entities[name].filter({}, '-created_date', 5000).catch(() => []);
    for (const r of rows) {
      const blob = JSON.stringify(r);
      if (!markers.some((m) => blob.includes(m))) continue;
      count++;
      if (remove) await svc.entities[name].delete(r.id).catch(() => {});
    }
  }
  return count;
}

// A verification run that dies half way through must not leave money records
// behind for someone to find later and wonder about.
let cleaning = false;
async function emergencyCleanup(reason: unknown) {
  if (cleaning) return;
  cleaning = true;
  console.error('\nVERIFICATION CRASHED:', reason);
  const removed = await sweep(true).catch(() => -1);
  const users = await prisma.appUser.deleteMany({ where: { email: { contains: RUN } } }).catch(() => ({ count: -1 }));
  console.error(`  emergency cleanup removed ${removed} records and ${users.count} accounts`);
  console.log(`\n== ${pass} passed, ${fail + 1} failed ==`);
  console.log(`  - the run did not complete: ${String((reason as any)?.message || reason)}`);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
}
process.on('uncaughtException', emergencyCleanup);
process.on('unhandledRejection', emergencyCleanup);

/**
 * Registration.
 *
 * POST /api/auth/register cannot be driven from a script — src/index.ts calls
 * app.listen() at import time and exports no app — so the route's own
 * primitives are called directly rather than stubbed: the same password hash,
 * the same starting shape (visitor, no marketplace privilege), the same token.
 */
async function register(kind: string, fullName: string, role = 'user') {
  const email = `${RUN}-${kind}@razekit.test`;
  const password = `verify-only-${RUN}-passphrase`;
  const passwordHash = await hashPassword(password);
  const row = await prisma.appUser.create({
    data: { email, passwordHash, fullName, emailVerified: true, userRole: 'visitor', role, accountStatus: 'active' },
  });
  // Ledger accounts, payouts and notifications are keyed on the user id rather
  // than on the run marker, so cleanup has to know it.
  owned.push(row.id);
  return { row, password, rls: { id: row.id, role: row.role, user_role: row.userRole, email, full_name: fullName } as any };
}

/** Pick the account type, the way onboarding does. */
async function chooseRole(rls: any, userRole: string) {
  const updated = await prisma.appUser.update({
    where: { id: rls.id }, data: { userRole, onboardingCompleted: true },
  });
  rls.user_role = updated.userRole;
  return updated;
}

const asUser = (rls: any) => makeEntities(userCtx(rls));

/** Did this write hit the entity guard, and with what? */
async function refused(fn: () => Promise<unknown>): Promise<{ blocked: boolean; message: string; status: number | null }> {
  try {
    await fn();
    return { blocked: false, message: 'the write was ACCEPTED', status: null };
  } catch (e: any) {
    return { blocked: true, message: String(e?.message || e), status: e?.status ?? null };
  }
}

// ── 0. Preconditions ────────────────────────────────────────────────────────
// A missing dependency is reported here, once, rather than surfacing later as a
// confusing failure three steps downstream.
console.log('-- Preconditions --');
const constraints = await ensureFinanceConstraints();
ok('database duplicate-protection indexes are applied', constraints.ok, constraints.error || '');
const rules = await svc.entities.MoneyRule.filter({ active: true }, '-created_date', 50).catch(() => []);
ok('a platform fee rule is seeded', rules.some((r: any) => r.rule_type === 'PLATFORM_FEE'), 'run: npm run seed:money');
ok('a tax rule is seeded', rules.some((r: any) => r.rule_type === 'TAX'), 'run: npm run seed:money');

// The platform's own books are shared with every other contest in the database.
// Their balances are captured now so cleanup can prove it left no drift behind.
const PLATFORM_CLASSES = [ACCOUNT_CLASS.BANK_SETTLEMENT, ACCOUNT_CLASS.PLATFORM_FEE, ACCOUNT_CLASS.TAX_PAYABLE];
const platformBefore: Record<string, { id: string; balance: number }> = {};
for (const cls of PLATFORM_CLASSES) {
  const acct = await getOrCreateAccount(svc, { accountClass: cls, currency: 'INR', subjectId: null });
  platformBefore[cls] = { id: acct.id, balance: Number(acct.balance_minor || 0) };
}

// ── 1. The client registers ─────────────────────────────────────────────────
console.log('\n-- 1. Client registers --');
const clientAcct = await register('client', `${RUN} Brand`);
const client = clientAcct.rls;
ok('the registered password verifies against the stored hash',
  await verifyPassword(clientAcct.password, clientAcct.row.passwordHash));
ok('a wrong password does not', !(await verifyPassword('not-the-password', clientAcct.row.passwordHash)));
eq('the session token resolves to this account', verifyToken(signToken(client.id))?.sub, client.id);
eq('a new account starts as a visitor, with no marketplace privilege', clientAcct.row.userRole, 'visitor');

// Account type gates Contest creation, so it must not be self-grantable through
// the generic entity API.
await asUser(client).User.update(client.id, { user_role: 'client' }).catch(() => null);
const afterSelfGrant = await prisma.appUser.findUnique({ where: { id: client.id } });
eq('a user cannot grant themselves the client role through the entity API', afterSelfGrant?.userRole, 'visitor');
await chooseRole(client, 'client');
eq('choosing an account type during onboarding does set it', client.user_role, 'client');

// ── 2. The client creates a contest ─────────────────────────────────────────
console.log('\n-- 2. Contest created --');
const contestRow: any = await asUser(client).Contest.create({
  title: `${RUN} end-to-end campaign`,
  description: 'Automated end-to-end verification run.',
  category: 'Short-form video',
  prize_amount: PRIZE_MAJOR,
  currency: 'INR',
  settlement_region: 'IN',
  deadline: new Date(Date.now() + 5 * 864e5).toISOString(),
  status: 'draft',
  required_platform: 'instagram',
  cover_image_url: COVER,
  brand_destination_url: 'https://example.com/e2e-landing',
  demo: RUN,
}).catch((e: any) => ({ __error: String(e?.message || e) }));
ok('the client can create a contest', Boolean(contestRow?.id), contestRow?.__error || '');
if (!contestRow?.id) {
  await sweep(true);
  await prisma.appUser.deleteMany({ where: { email: { contains: RUN } } });
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  console.log('\nAborted: the contest could not be created, so nothing downstream can be verified.');
  await prisma.$disconnect();
  process.exit(1);
}
const contestId = own(contestRow).id;
eq('a new contest is a draft, not live', contestRow.status, 'draft');
eq('the server stamped the fairness rule the client cannot write',
  contestRow.duration_rule_version, 'rk-duration-1.0.0');
eq('and the duration band that rule allows', Number(contestRow.max_duration_days), 7);
ok('no winner exists yet', !contestRow.winner_user_id && !contestRow.winner_submission_id);

const creatorAcct = await register('creator', `${RUN} Winning Creator`);
const creator = creatorAcct.rls;
await chooseRole(creator, 'creator');
const rivalAcct = await register('rival', `${RUN} Rival Creator`);
const rival = rivalAcct.rls;
await chooseRole(rival, 'creator');
const thirdAcct = await register('third', `${RUN} Third Creator`);
const third = thirdAcct.rls;
await chooseRole(third, 'creator');
const adminAcct = await register('admin', `${RUN} Admin`, 'admin');
const admin = adminAcct.rls;

// The protected-field list is the mechanism, so it is asserted by name and not
// only by its effect.
ok("winner_user_id is on Contest's protected-field list",
  PROTECTED_FIELDS.Contest.includes('winner_user_id'));
const earlyForge = await refused(() => asUser(client).Contest.update(contestId, { winner_user_id: creator.id }));
ok('a client cannot set the winner through the entity API', earlyForge.blocked, earlyForge.message);
eq('and the refusal is a 403', earlyForge.status, 403);

// ── 3. Criteria confirmed (this is what unlocks funding) ────────────────────
console.log('\n-- 3. Requirements confirmed --');
const notOwnerCriteria: any = await criteriaConfirm(ctx(creator, {
  contest_id: contestId, confirmed: true, criteria: [{ key: 'publishing.published', mandatory: true }],
}));
eq('a creator cannot confirm a brand’s requirements', notOwnerCriteria.status, 403);

const confirmed: any = await criteriaConfirm(ctx(client, {
  contest_id: contestId,
  confirmed: true,
  criteria: [
    { key: 'publishing.platform', mandatory: true, params: { platforms: ['instagram'] } },
    { key: 'publishing.published', mandatory: true },
    { key: 'publishing.caption', mandatory: true },
    { key: 'delivery.deadline', mandatory: true },
  ],
}));
ok('the client can confirm the requirements', confirmed.status === 200, why(confirmed));
eq('and they lock immediately', confirmed.json.locked, true);
eq('locking is what unlocks payment', confirmed.json.payment_unlocked, true);
eq('all four requirements are mandatory', Number(confirmed.json.mandatory_count), 4);
const criteriaVersionId = confirmed.json.criteria_version_id;
const stamped = await svc.entities.Contest.get(contestId);
eq('the server stamped the criteria version on the contest', stamped.criteria_version_id, criteriaVersionId);
const readRules: any = await criteriaGet(ctx(creator, { contest_id: contestId }));
eq('a creator can read the rules they will be judged against', readRules.status, 200);

// ── 4. Funding — the manual beta path ───────────────────────────────────────
console.log('\n-- 4. Funding (manual beta: report, then a person verifies) --');
const zeroAtStart = await razekitBalance(svc, { userId: client.id, currency: 'INR', role: 'client' });
eq('the client holds nothing before any transfer', zeroAtStart.total_minor, 0);

const instr: any = await fundingInstructions(ctx(client, { contest_id: contestId }));
ok('the funding instructions are issued', instr.status === 200,
  `${why(instr)} — the manual beta needs a configured payment method (Admin -> Finance -> Payment Settings, or BETA_BANK_* / BETA_UPI_ID)`);
const funding = instr.json?.funding;
if (!funding?.id) {
  await sweep(true);
  await prisma.appUser.deleteMany({ where: { email: { contains: RUN } } });
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  console.log('\nAborted: without payment instructions there is no funding request, so the rest of the chain cannot be exercised.');
  await prisma.$disconnect();
  process.exit(1);
}
own(funding);
ok('at least one payment method is actually configured', (instr.json.instructions?.methods || []).length > 0);
ok('a transfer reference is issued so a human can match the payment', Boolean(instr.json.transfer_note));
eq('the funding request is awaiting money', funding.status, FUNDING.PAYMENT_INSTRUCTIONS_SHOWN);
const totalMinor = Number(funding.total_amount_minor);
eq('the prize is billed in full', Number(funding.prize_amount_minor), PRIZE_MINOR);
ok('the total is prize plus fee plus tax',
  totalMinor === PRIZE_MINOR + Number(funding.platform_fee_minor) + Number(funding.tax_minor),
  `${totalMinor} vs ${PRIZE_MINOR}+${funding.platform_fee_minor}+${funding.tax_minor}`);
console.log(`       amount due: ${toMajor(totalMinor, 'INR')} INR`);

const peeking: any = await fundingStatus(ctx(creator, { funding_id: funding.id }));
eq('another account cannot read this funding request', peeking.status, 403);

const beforeReport = await svc.entities.LedgerTransaction.filter({ funding_id: funding.id }, '-created_date', 50).catch(() => []);
eq('nothing is posted to the ledger merely by asking for instructions', beforeReport.length, 0);

const utr = `UTR${RUN.toUpperCase().replace(/[^A-Z0-9]/g, '')}01`;
const reported: any = await fundingReportTransfer(ctx(client, {
  funding_id: funding.id, amount: toMajor(totalMinor, 'INR'), reference: utr,
  method: 'BANK_TRANSFER', transfer_date: new Date().toISOString().slice(0, 10),
}));
ok('the client can report the transfer', reported.status === 200, why(reported));
eq('the claim lands in the verification queue', reported.json.funding.status, FUNDING.PENDING_VERIFICATION);

// The assertion this whole path exists for: a CLAIM is not money.
const afterReportTxns = await svc.entities.LedgerTransaction.filter({ funding_id: funding.id }, '-created_date', 50).catch(() => []);
eq('reporting a transfer creates NO ledger transaction', afterReportTxns.length, 0);
const balAfterReport = await razekitBalance(svc, { userId: client.id, currency: 'INR', role: 'client' });
eq('the client balance is still ZERO after reporting', balAfterReport.total_minor, 0);
eq('and nothing is reserved against the contest', balAfterReport.reserved_minor, 0);
const draftStill = await svc.entities.Contest.get(contestId);
eq('the contest is still a draft on a mere claim', draftStill.status, 'draft');

const creatorVerify: any = await financeVerifyFunding(ctx(creator, { funding_id: funding.id, bank_reference: utr }));
eq('a creator cannot verify funding', creatorVerify.status, 403);
const selfVerify: any = await financeVerifyFunding(ctx(client, { funding_id: funding.id, bank_reference: utr }));
eq('a client cannot verify their own payment', selfVerify.status, 403);
const stillZero = await razekitBalance(svc, { userId: client.id, currency: 'INR', role: 'client' });
eq('a refused verification leaves the balance at ZERO', stillZero.total_minor, 0);

const verified: any = await financeVerifyFunding(ctx(admin, {
  funding_id: funding.id, bank_reference: `BANKREF-${RUN}`,
  verified_amount: toMajor(totalMinor, 'INR'), note: 'Matched against the bank statement',
}));
ok('an admin can verify the transfer', verified.status === 200, why(verified));
eq('the funding is VERIFIED', verified.json.funding.status, FUNDING.VERIFIED);
eq('the reconciliation matched', verified.json.match, 'MATCHED');
eq('verification is what publishes the contest', verified.json.contest_published, true);
const liveContest = await svc.entities.Contest.get(contestId);
eq('the contest is now open', liveContest.status, 'open');

const credits = await svc.entities.LedgerTransaction.filter({ funding_id: funding.id, txn_type: 'FUNDING_RECEIVED' }, '-created_date', 20).catch(() => []);
eq('exactly ONE funding credit was posted', credits.length, 1);
const reservations = await svc.entities.LedgerTransaction.filter({ funding_id: funding.id, txn_type: 'PRIZE_RESERVED' }, '-created_date', 20).catch(() => []);
eq('and exactly ONE prize reservation', reservations.length, 1);
const committed = await balanceOf(svc, { accountClass: ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, currency: 'INR', subjectId: contestId });
eq('the prize is committed to THIS contest', committed.balance_minor, PRIZE_MINOR);
const clientFunded = await razekitBalance(svc, { userId: client.id, currency: 'INR', role: 'client' });
eq('the client now shows the prize as reserved', clientFunded.reserved_minor, PRIZE_MINOR);
eq('and nothing loose beyond it', clientFunded.available_minor, 0);

// ── 5. The creator registers, discovers, joins and submits ──────────────────
console.log('\n-- 5. Creator joins and submits --');
const discovered = await asUser(creator).Contest.filter({ status: 'open' }, '-created_date', 200).catch(() => []);
ok('the creator can discover the live contest', discovered.some((c: any) => c.id === contestId));
const discoveredRow = discovered.find((c: any) => c.id === contestId);
eq('and it advertises the platform it requires', String(discoveredRow?.required_platform), 'instagram');

// A link from the wrong platform is refused at the write, not at judging time.
const wrongPlatform = await refused(() => asUser(creator).Submission.create({
  contest_id: contestId, client_id: client.id, title: `${RUN} wrong platform`,
  live_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', status: 'submitted', demo: RUN,
}));
ok('an Instagram-only contest refuses a YouTube link', wrongPlatform.blocked, wrongPlatform.message);

const winnerSub: any = own(await asUser(creator).Submission.create({
  contest_id: contestId,
  client_id: client.id,
  title: `${RUN} winning entry`,
  caption: 'Our best cut for the campaign. #razekit',
  description: 'Entry submitted by the end-to-end verification run.',
  media_kind: 'video',
  final_asset_uri: WINNER_ASSET,
  thumbnail: `https://cdn.example.com/${RUN}/winning-thumb.jpg`,
  live_url: WINNER_POST,
  status: 'submitted',
  submitted_at: new Date().toISOString(),
  demo: RUN,
}));
eq('the creator can submit', winnerSub.status, 'submitted');
eq('the link is recognised as a real public post URL', winnerSub.url_status, URL_STATUS.LINK_VALID);
eq('the platform is derived from the URL, not from what the client called it', winnerSub.platform, 'instagram');
eq('and the URL is stored normalised', winnerSub.live_url, parsePublicationUrl(WINNER_POST).normalized_url);
ok('RazeKit stamped when it first saw the link live', Boolean(winnerSub.published_at));
ok('no score exists before anything has been measured',
  winnerSub.final_score == null && winnerSub.engagement_score == null && winnerSub.traffic_score == null);

const scoreForge = await refused(() => asUser(creator).Submission.update(winnerSub.id, { final_score: 100, status: 'won' }));
ok('a creator cannot score themselves or declare themselves the winner', scoreForge.blocked, scoreForge.message);

const rivalSub: any = own(await asUser(rival).Submission.create({
  contest_id: contestId, client_id: client.id, title: `${RUN} rival entry`,
  caption: 'Rival cut for the campaign.', media_kind: 'video',
  final_asset_uri: RIVAL_ASSET, live_url: RIVAL_POST,
  status: 'submitted', submitted_at: new Date().toISOString(), demo: RUN,
}));
// A third entry that breaks a mandatory requirement (no caption), so the
// compliance gate is exercised with something it must actually exclude.
const noCapSub: any = own(await asUser(third).Submission.create({
  contest_id: contestId, client_id: client.id, title: `${RUN} entry without a caption`,
  media_kind: 'video', live_url: NOCAP_POST,
  status: 'submitted', submitted_at: new Date().toISOString(), demo: RUN,
}));
eq('three entries are in the contest',
  (await svc.entities.Submission.filter({ contest_id: contestId }, '-created_date', 50)).length, 3);

// ── 6. Compliance ───────────────────────────────────────────────────────────
console.log('\n-- 6. Compliance --');
const nosey: any = await complianceEvaluate(ctx(rival, { submission_id: winnerSub.id }));
eq('a rival cannot run compliance on someone else’s entry', nosey.status, 403);

const c1: any = await complianceEvaluate(ctx(creator, { submission_id: winnerSub.id }));
eq('the winning entry is ELIGIBLE', c1.json.status, ELIGIBILITY.ELIGIBLE);
eq('it is measured against the locked criteria version', c1.json.criteria_version_id, criteriaVersionId);
ok('every mandatory requirement passed',
  Number(c1.json.mandatory_failed) === 0 && Number(c1.json.review_required) === 0);
const c1again: any = await complianceEvaluate(ctx(creator, { submission_id: winnerSub.id }));
eq('re-running on unchanged content returns the cached result', c1again.json.cached, true);
eq('and does not change the answer', c1again.json.status, ELIGIBILITY.ELIGIBLE);

const c2: any = await complianceEvaluate(ctx(rival, { submission_id: rivalSub.id }));
eq('the rival entry is ELIGIBLE too', c2.json.status, ELIGIBILITY.ELIGIBLE);
const c3: any = await complianceEvaluate(ctx(third, { submission_id: noCapSub.id }));
eq('the entry missing a mandatory caption is INELIGIBLE', c3.json.status, ELIGIBILITY.INELIGIBLE);
ok('and the reason names the failure',
  String(c3.json.reason || '').toLowerCase().includes('mandatory'), c3.json.reason);
const findings = await svc.entities.SubmissionComplianceFinding.filter({ submission_id: noCapSub.id }, '-created_date', 20).catch(() => []);
ok('the finding points at the caption rule',
  findings.some((f: any) => f.criterion_key === 'publishing.caption' && f.status === 'fail'));

// ── 7. Scoring: measured engagement + measured brand traffic ────────────────
console.log('\n-- 7. Scoring --');
const winLink: any = await trackingLinkCreate(ctx(creator, { submission_id: winnerSub.id }));
ok('the creator gets a tracked link for their entry', winLink.status === 200, why(winLink));
const rivalLink: any = await trackingLinkCreate(ctx(rival, { submission_id: rivalSub.id }));
ok('so does the rival', rivalLink.status === 200, why(rivalLink));
const stolenLink: any = await trackingLinkCreate(ctx(rival, { submission_id: winnerSub.id }));
eq('but nobody can mint a link against another creator’s entry', stolenLink.status, 403);

// Real clicks through the real fraud classifier. Sequential on purpose: the
// counters are read-modify-written, and a parallel burst would be measuring the
// race rather than the traffic.
let verifiedClicks = 0;
for (let i = 0; i < 6; i++) {
  const r = await recordClick({
    code: winLink.json.code, ip: `198.51.100.${20 + i}`, userAgent: BROWSER_UA,
    referrer: 'https://www.instagram.com/',
  });
  if (r.state === 'verified') verifiedClicks++;
}
for (let i = 0; i < 2; i++) {
  await recordClick({
    code: rivalLink.json.code, ip: `198.51.100.${80 + i}`, userAgent: BROWSER_UA,
    referrer: 'https://www.instagram.com/',
  });
}
eq('every genuine click was counted as verified', verifiedClicks, 6);
const replay = await recordClick({ code: winLink.json.code, ip: '198.51.100.20', userAgent: BROWSER_UA });
eq('a refresh by the same visitor is a duplicate, not a second visitor', replay.state, 'duplicate');
const selfClick = await recordClick({ code: winLink.json.code, ip: '203.0.113.7', userAgent: BROWSER_UA, viewerUserId: creator.id });
eq('a creator clicking their own link earns nothing', selfClick.state, 'rejected');
const botClick = await recordClick({ code: winLink.json.code, ip: '203.0.113.8', userAgent: 'python-requests/2.31' });
eq('an automated agent earns nothing either', botClick.state, 'rejected');

const winLinkRow: any = own((await svc.entities.TrackingLink.filter({ submission_id: winnerSub.id }, '-created_date', 1))[0]);
const rivalLinkRow: any = own((await svc.entities.TrackingLink.filter({ submission_id: rivalSub.id }, '-created_date', 1))[0]);
eq('the winning entry recorded six unique visitors', Number(winLinkRow?.unique_visitors), 6);
eq('the rival recorded two', Number(rivalLinkRow?.unique_visitors), 2);
ok('the rejected clicks are counted separately, not as traffic',
  Number(winLinkRow?.suspicious_clicks) >= 2, String(winLinkRow?.suspicious_clicks));

// Engagement enters the system as recorded campaign-post data. RazeKit holds no
// platform API credentials (see verification/platforms.ts), so nothing here
// pretends to have read Instagram. What is under test is that the ENGINE turns
// recorded signals into a score — not that the signals were fetched.
own(await svc.entities.SocialCampaignPost.create({
  client_id: client.id, contest_id: contestId, creator_id: creator.id, submission_id: winnerSub.id,
  platform: 'instagram', status: 'published', live_url: winnerSub.live_url,
  metrics: JSON.stringify({
    views: 42000, likes: 3100, comments: 280, shares: 640, saves: 510, watch_time: 21000, follower_growth: 190,
  }),
  last_checked_at: new Date().toISOString(), demo: RUN,
}));
own(await svc.entities.SocialCampaignPost.create({
  client_id: client.id, contest_id: contestId, creator_id: rival.id, submission_id: rivalSub.id,
  platform: 'instagram', status: 'published', live_url: rivalSub.live_url,
  metrics: JSON.stringify({
    views: 9000, likes: 480, comments: 40, shares: 70, saves: 55, watch_time: 3100, follower_growth: 20,
  }),
  last_checked_at: new Date().toISOString(), demo: RUN,
}));

const computed: any = await computeContestScores(svc, contestId);
const byId = new Map<string, any>([...(computed.ranked || []), ...(computed.unscored || [])].map((s: any) => [s.id, s]));
const winScore = byId.get(winnerSub.id);
const rivalScore = byId.get(rivalSub.id);
const noCapScore = byId.get(noCapSub.id);
ok('the winning entry has a measured engagement score',
  typeof winScore?.engagement_score === 'number', String(winScore?.engagement_score));
ok('and a measured brand traffic score',
  typeof winScore?.traffic_score === 'number', String(winScore?.traffic_score));
eq('the final score is the engine’s weighted combination of the two',
  winScore?.final_score, weightedFinalScore(winScore?.engagement_score, winScore?.traffic_score, DEFAULT_CONFIG));
ok('the better-performing entry scores higher',
  Number(winScore?.final_score) > Number(rivalScore?.final_score),
  `${winScore?.final_score} vs ${rivalScore?.final_score}`);
eq('it ranks first', Number(winScore?.rank), 1);
eq('the scoring version is recorded', winScore?.scoring_version, SCORING_VERSION);
// The rule that matters more than the ranking: a metric nobody measured is not
// a zero.
eq('an entry with no signals is INSUFFICIENT_DATA, not zero', noCapScore?.score_state, SCORE_STATES.INSUFFICIENT_DATA);
ok('and its scores are null rather than 0',
  noCapScore?.final_score === null && noCapScore?.engagement_score === null && noCapScore?.traffic_score === null,
  JSON.stringify({ f: noCapScore?.final_score, e: noCapScore?.engagement_score, t: noCapScore?.traffic_score }));

// ── 8. Winner finalization — server-side, and only server-side ──────────────
console.log('\n-- 8. Winner finalization --');
const forgeWinner = await refused(() => asUser(client).Contest.update(contestId, {
  winner_user_id: rival.id, winner_submission_id: rivalSub.id, status: 'winner_selected',
}));
ok('a client CANNOT set winner_user_id through the entity API', forgeWinner.blocked, forgeWinner.message);
eq('the refusal is a 403', forgeWinner.status, 403);
ok('the refusal names the field', /winner_user_id/.test(forgeWinner.message), forgeWinner.message);
const untouched = await svc.entities.Contest.get(contestId);
ok('and the contest still has no winner', !untouched.winner_user_id);

const adminForge = await refused(() => asUser(admin).Contest.update(contestId, { winner_user_id: rival.id }));
ok('not even an admin can, through the generic entity API', adminForge.blocked, adminForge.message);

const creatorFinalize: any = await winnerFinalize(ctx(creator, { contest_id: contestId }));
eq('a creator cannot finalize a winner', creatorFinalize.status, 403);

const override: any = await winnerFinalize(ctx(client, { contest_id: contestId, submission_id: rivalSub.id }));
eq('the brand cannot override the computed winner', override.status, 422);
eq('and is told why', override.json?.error?.code, 'OVERRIDE_REJECTED');
const afterOverride = await svc.entities.Contest.get(contestId);
ok('a rejected override finalizes nothing', !afterOverride.winner_user_id);

const finalized: any = await winnerFinalize(ctx(client, { contest_id: contestId }));
ok('the brand can finalize, and the score decides', finalized.status === 200, why(finalized));
eq('the winner was chosen by the engine, not picked', finalized.json.selection_method, 'scored');
eq('the highest-scoring entry won', finalized.json.winner_submission_id, winnerSub.id);
eq('and its creator is the winner', finalized.json.winner_user_id, creator.id);
const finalContest = await svc.entities.Contest.get(contestId);
eq('the contest records the same winner', finalContest.winner_submission_id, winnerSub.id);
ok('the ineligible entry was never in the running',
  finalContest.winner_submission_id !== noCapSub.id && finalContest.winner_user_id !== third.id);

const writtenWinner = await svc.entities.Submission.get(winnerSub.id);
eq('the server wrote the score onto the winning entry',
  Number(writtenWinner.final_score), Number(winScore?.final_score));
eq('and marked it won', writtenWinner.status, 'won');
const writtenRival = await svc.entities.Submission.get(rivalSub.id);
eq('the runner-up is marked not selected', writtenRival.status, 'not_selected');
const snapshots = await svc.entities.ScoreSnapshot.filter({ contest_id: contestId }, '-created_date', 20).catch(() => []);
snapshots.forEach((s: any) => own(s));
ok('an immutable score snapshot was taken', snapshots.length >= 2, `${snapshots.length} snapshots`);
const winnerSnap = snapshots.find((s: any) => s.submission_id === winnerSub.id);
eq('the snapshot names the winner', winnerSnap?.is_winner, true);
eq('and records the criteria version it was judged under', winnerSnap?.criteria_version_id, criteriaVersionId);

const refinalize: any = await winnerFinalize(ctx(client, { contest_id: contestId }));
eq('a contest cannot be finalized twice', refinalize.json?.error?.code, 'ALREADY_FINALIZED');

// ── 9. Winners Hub record ───────────────────────────────────────────────────
console.log('\n-- 9. WinnerPublish --');
const publishes = await svc.entities.WinnerPublish.filter({ contest_id: contestId }, '-created_date', 10).catch(() => []);
publishes.forEach((p: any) => own(p));
eq('exactly one Winners Hub record exists', publishes.length, 1);
const publish: any = publishes[0];
eq('it points at the WINNING submission', publish?.submission_id, winnerSub.id);
eq('and at the winning creator', publish?.creator_id, creator.id);
// The bug this exists to catch: showing the campaign's cover art as if it were
// the entry that won.
eq('the media is the winning entry’s own asset', publish?.media_uri, WINNER_ASSET);
ok('it is NOT the campaign cover', publish?.media_uri !== COVER, String(publish?.media_uri));
ok('and NOT the runner-up’s asset', publish?.media_uri !== RIVAL_ASSET, String(publish?.media_uri));
eq('the winning post URL carries through', publish?.original_post_url, parsePublicationUrl(WINNER_POST).normalized_url);
ok('and it is not the runner-up’s post',
  publish?.original_post_url !== parsePublicationUrl(RIVAL_POST).normalized_url);
eq('the platform is recorded from the parsed link', publish?.original_platform, 'instagram');
// Honest about what RazeKit can actually render: Instagram serves no dependable
// logged-out embed, so this must be false rather than optimistic.
eq('no embed is claimed for a platform that does not serve one', publish?.embed_available, false);

// ── 10. The winner verifies the account they published from ────────────────
console.log('\n-- 10. Winner verification --');
const payouts = await svc.entities.Payout.filter({ contest_id: contestId }, '-created_date', 5).catch(() => []);
payouts.forEach((p: any) => own(p));
eq('a payout record was created for the winner', payouts.length, 1);
eq('it is not payable yet', payouts[0]?.status, 'PAYOUT_NOT_ELIGIBLE');
ok('and the reason is the unverified account, not the money',
  /verif/i.test(String(payouts[0]?.eligibility_reason || '')), String(payouts[0]?.eligibility_reason));

const verifications = await svc.entities.WinnerVerification.filter({ contest_id: contestId }, '-created_date', 5).catch(() => []);
verifications.forEach((v: any) => own(v));
eq('verification was created the moment they won', verifications.length, 1);
eq('it starts PENDING', verifications[0]?.status, VERIFICATION_STATUS.PENDING);
const preConnect = await svc.entities.SocialAccount.filter({ user_id: creator.id }, '-created_date', 5).catch(() => []);
eq('the creator never connected a social account to enter or win', preConnect.length, 0);

const rivalPeek: any = await winnerVerificationStatus(ctx(rival, { contest_id: contestId }));
eq('a losing creator cannot read the winner’s verification', rivalPeek.status, 403);
const rivalStart: any = await winnerVerificationStart(ctx(rival, { contest_id: contestId, platform: 'instagram' }));
eq('nor start one', rivalStart.json?.error?.code, 'NOT_THE_WINNER');

const started: any = await winnerVerificationStart(ctx(creator, {
  contest_id: contestId, platform: 'instagram', handle: `@${RUN}`,
}));
ok('the winner can start verification', started.status === 200, why(started));
eq('a challenge code is issued', started.json.verification.status, VERIFICATION_STATUS.CODE_ISSUED);
ok('and the code is real', String(started.json.verification.challenge_code || '').startsWith('RAZEKIT-'));
const verificationId = started.json.verification.id;

const brandReview: any = await winnerVerificationReview(ctx(client, {
  verification_id: verificationId, decision: 'verify', reason: 'Approving my own contest winner.',
}));
eq('a brand cannot mark its own winner verified', brandReview.status, 403);
const shortReason: any = await winnerVerificationReview(ctx(admin, {
  verification_id: verificationId, decision: 'verify', reason: 'ok',
}));
eq('an admin must give a real reason', shortReason.json?.error?.code, 'REASON_REQUIRED');

const approvedVerification: any = await winnerVerificationReview(ctx(admin, {
  verification_id: verificationId, decision: 'verify',
  reason: `${RUN}: confirmed the challenge code was visible on the creator's Instagram profile.`,
}));
ok('an admin can verify with a recorded reason', approvedVerification.status === 200, why(approvedVerification));
eq('the verification is VERIFIED', approvedVerification.json.verification.status, VERIFICATION_STATUS.VERIFIED);
const paymentPending = await svc.entities.Contest.get(contestId);
eq('only now does the contest move toward payment', paymentPending.lifecycle_state, LIFECYCLE.PAYMENT_PENDING);
ok('and the verification moment is recorded', Boolean(paymentPending.winner_verified_at));
const connected = await svc.entities.SocialAccount.filter({ user_id: creator.id }, '-created_date', 5).catch(() => []);
connected.forEach((a: any) => own(a));
eq('a verified social account now exists', connected.length, 1);
ok('and it stores no token, password or secret',
  !/access_token|refresh_token|password|secret/i.test(JSON.stringify(connected[0] || {})));

// ── 11. Payout: the debit happens at confirmation, nowhere earlier ──────────
console.log('\n-- 11. Payout --');
const owed = await razekitBalance(svc, { userId: creator.id, currency: 'INR', role: 'creator' });
eq('the winner is owed the full prize', owed.available_minor, PRIZE_MINOR);
eq('with nothing paid yet', owed.paid_out_minor, 0);

const forgeBalance = await refused(async () => {
  const wallets = await svc.entities.Wallet.filter({ user_id: creator.id }, '-created_date', 1).catch(() => []);
  if (!wallets.length) throw Object.assign(new Error('no Wallet row exists to attack'), { status: 404 });
  return asUser(creator).Wallet.update(wallets[0].id, { available_balance_minor: 99999999 });
});
ok('a creator cannot forge their own balance', forgeBalance.blocked, forgeBalance.message);
const forgeLedger = await refused(() => asUser(creator).LedgerEntry.create({
  account_id: 'x', direction: 'CREDIT', amount_minor: 99999999, currency: 'INR',
  transaction_id: 'x', posted_at: new Date().toISOString(),
}));
ok('nor write a ledger entry', forgeLedger.blocked, forgeLedger.message);

const noBank: any = await withdrawalRequest(ctx(creator, { amount: PRIZE_MAJOR }));
eq('a withdrawal without bank details is refused', noBank.json?.error?.code, 'BANK_DETAILS_REQUIRED');
const savedAccount: any = await payoutAccountSave(ctx(creator, {
  account_holder_name: `${RUN} Winning Creator`, account_number: '123456789012',
  confirm_account_number: '123456789012', ifsc: 'HDFC0001234', bank_name: 'HDFC Bank',
}));
ok('the creator can save bank details', savedAccount.status === 200, why(savedAccount));
ok('and they come back masked', !JSON.stringify(savedAccount.json).includes('123456789012'));

const debits = async () => (await svc.entities.LedgerTransaction
  .filter({ creator_id: creator.id, txn_type: 'WITHDRAWAL_PAID' }, '-created_date', 20).catch(() => [])).length;

const wdr: any = await withdrawalRequest(ctx(creator, { amount: PRIZE_MAJOR }));
ok('the creator can request a withdrawal', wdr.status === 200, why(wdr));
const withdrawalId = wdr.json?.withdrawal?.id;
if (wdr.json?.withdrawal) own(wdr.json.withdrawal);
eq('it starts as REQUESTED', wdr.json?.withdrawal?.status, 'REQUESTED');
eq('requesting posts NO debit', await debits(), 0);
const atRequest = await razekitBalance(svc, { userId: creator.id, currency: 'INR', role: 'creator' });
eq('the total owed is unchanged by asking', atRequest.total_minor, PRIZE_MINOR);
eq('the amount is reserved, not spent', atRequest.pending_minor, PRIZE_MINOR);
eq('nothing has been paid out', atRequest.paid_out_minor, 0);

const creatorApprove: any = await financeWithdrawalApprove(ctx(creator, { withdrawal_id: withdrawalId }));
eq('a creator cannot approve their own withdrawal', creatorApprove.status, 403);
const creatorConfirm: any = await financeWithdrawalConfirm(ctx(creator, { withdrawal_id: withdrawalId }));
eq('nor confirm their own payout', creatorConfirm.status, 403);
eq('and neither attempt posted a debit', await debits(), 0);

const reviewed: any = await financeWithdrawalReview(ctx(admin, {
  withdrawal_id: withdrawalId, note: 'Balance checked against the ledger.',
}));
ok('an admin can take it under review', reviewed.status === 200, why(reviewed));
eq('it is UNDER_REVIEW', reviewed.json?.withdrawal?.status, 'UNDER_REVIEW');
eq('review posts no debit', await debits(), 0);

const approved: any = await financeWithdrawalApprove(ctx(admin, {
  withdrawal_id: withdrawalId, note: 'Approved for transfer.',
}));
ok('an admin can approve it', approved.status === 200, why(approved));
eq('it is APPROVED', approved.json?.withdrawal?.status, 'APPROVED');
eq('approval posts no debit either', await debits(), 0);

const early: any = await financeWithdrawalConfirm(ctx(admin, { withdrawal_id: withdrawalId }));
ok('confirming before a transfer is recorded is refused', early.status >= 400, why(early));
eq('and the premature confirm posted no debit', await debits(), 0);

const noRef: any = await financeWithdrawalTransferSent(ctx(admin, { withdrawal_id: withdrawalId }));
eq('recording a transfer without a bank reference is refused', noRef.json?.error?.code, 'PAYMENT_REFERENCE_REQUIRED');
const sent: any = await financeWithdrawalTransferSent(ctx(admin, {
  withdrawal_id: withdrawalId, payment_reference: `PAYUTR-${RUN}`,
  transfer_date: new Date().toISOString().slice(0, 10),
}));
ok('the admin can record the real-world transfer', sent.status === 200, why(sent));
eq('it is TRANSFER_SENT', sent.json?.withdrawal?.status, 'TRANSFER_SENT');
eq('recording the transfer STILL posts no debit', await debits(), 0);

const settledNow: any = await financeWithdrawalConfirm(ctx(admin, {
  withdrawal_id: withdrawalId, note: 'Settled against the bank statement.',
}));
ok('the admin can confirm the payout', settledNow.status === 200, why(settledNow));
eq('the withdrawal is PAID', settledNow.json?.withdrawal?.status, 'PAID');
eq('confirmation posts exactly ONE debit', await debits(), 1);
const confirmAgain: any = await financeWithdrawalConfirm(ctx(admin, { withdrawal_id: withdrawalId }));
eq('a repeated confirm is accepted without error', confirmAgain.status, 200);
eq('and reports that it was already paid', confirmAgain.json.already_paid, true);
eq('with ZERO additional debits', await debits(), 1);

const settled = await razekitBalance(svc, { userId: creator.id, currency: 'INR', role: 'creator' });
eq('the creator is owed nothing further', settled.total_minor, 0);
eq('and the prize shows as paid out', settled.paid_out_minor, PRIZE_MINOR);
const creatorView: any = await balanceOverview(ctx(creator, {}));
eq('the creator balance page agrees with the ledger', creatorView.json.balance.paid_out_minor, PRIZE_MINOR);
ok('and the history shows the transfer leaving',
  creatorView.json.transactions.some((t: any) => t.amount_minor === -PRIZE_MINOR));
const winnerPayout: any = await payoutOverview(ctx(creator, {}));
eq('the payout page loads for the winner', winnerPayout.status, 200);

// ── 12. One creator cannot read another creator's earnings ─────────────────
console.log('\n-- 12. Earnings isolation --');
const rivalBalance: any = await balanceOverview(ctx(rival, { user_id: creator.id }));
eq('a creator asking for someone else’s balance gets their own', rivalBalance.json.balance.paid_out_minor, 0);
eq('with no earnings invented for them', rivalBalance.json.balance.total_minor, 0);
ok('and no sight of the winner’s transfers',
  !JSON.stringify(rivalBalance.json.transactions || []).includes(String(PRIZE_MINOR)));
const rivalPayouts = await asUser(rival).Payout.filter({}, '-created_date', 50).catch(() => []);
eq('a creator sees none of another creator’s payouts',
  rivalPayouts.filter((p: any) => p.creator_id === creator.id).length, 0);
const rivalWithdrawals = await asUser(rival).WithdrawalRequest.filter({}, '-created_date', 50).catch(() => []);
eq('nor their withdrawals', rivalWithdrawals.filter((w: any) => w.user_id === creator.id).length, 0);
const rivalLedger = await asUser(rival).LedgerEntry.filter({}, '-created_date', 50).catch(() => []);
eq('nor any ledger entry at all', rivalLedger.length, 0);
const rivalNotifications = await asUser(rival).Notification.filter({}, '-created_date', 100).catch(() => []);
eq('nor the winner’s notifications',
  rivalNotifications.filter((n: any) => n.recipient_user_id === creator.id).length, 0);
const rivalTracker: any = await trackerCreatorOverview(ctx(rival, {}));
eq('the rival’s own tracker shows nothing paid out', rivalTracker.json.kpis.paid_out, 0);
eq('and no wins', rivalTracker.json.kpis.wins, 0);
const rivalCampaign: any = await trackerCampaignDetail(ctx(rival, { contest_id: contestId }));
eq('a creator cannot open the brand’s campaign detail', rivalCampaign.status, 403);

// ── 13. Notifications reached the right people ─────────────────────────────
console.log('\n-- 13. Notifications --');
const feedOf = async (u: any) => {
  const r: any = await notificationFeed(ctx(u, { limit: 200 }));
  return (r.json?.notifications || []) as any[];
};
const clientFeed = await feedOf(client);
const creatorFeed = await feedOf(creator);
const adminFeed = await feedOf(admin);
const says = (feed: any[], re: RegExp) => feed.some((n) => re.test(`${n.title} ${n.body}`));
ok('the client was told their transfer details were received', says(clientFeed, /transfer reported|we have your transfer/i));
ok('the client was told the payment was verified', says(clientFeed, /verified|contest is live|payment confirmed|funded/i));
ok('an admin was alerted that money needs checking', says(adminFeed, /transfer|funding|verify/i));
ok('the winner was told they won', says(creatorFeed, /you won/i));
ok('the winner was told their account was verified', says(creatorFeed, /verified/i));
ok('the winner was told the money was sent', says(creatorFeed, /paid|transferred|payout/i));
ok('an admin was alerted to the withdrawal request', says(adminFeed, /withdraw/i));
const creatorNotifications = await svc.entities.Notification.filter({ recipient_user_id: creator.id }, '-created_date', 100).catch(() => []);
ok('every notification the creator sees is addressed to them',
  creatorNotifications.length > 0 && creatorNotifications.every((n: any) => n.recipient_user_id === creator.id));

// ── 14. The Tracker reflects what happened ─────────────────────────────────
console.log('\n-- 14. Tracker --');
const campaign: any = await trackerCampaignDetail(ctx(client, { contest_id: contestId }));
ok('the brand can open the campaign', campaign.status === 200, why(campaign));
eq('it names the same winner the server chose', campaign.json.campaign.winner_submission_id, winnerSub.id);
const trackedWinner = campaign.json.entries.find((e: any) => e.submission_id === winnerSub.id);
eq('the winning entry is flagged as the winner', trackedWinner?.is_winner, true);
eq('the Tracker shows the score the engine computed', trackedWinner?.final_score, Number(winScore?.final_score));
eq('and the traffic that was actually verified', trackedWinner?.verified_visitors, 6);
ok('the breakdown explains how the score was produced',
  Array.isArray(trackedWinner?.score_breakdown?.components) && trackedWinner.score_breakdown.components.length > 0);
eq('the campaign traffic totals match the real clicks', campaign.json.traffic.unique_visitors, 8);
const trackedNoCap = campaign.json.entries.find((e: any) => e.submission_id === noCapSub.id);
eq('the unmeasured entry is reported as insufficient data, not zero',
  trackedNoCap?.score_state, SCORE_STATES.INSUFFICIENT_DATA);
ok('with a null score rather than a 0', trackedNoCap?.final_score === null, String(trackedNoCap?.final_score));

const creatorContests: any = await trackerCreatorContests(ctx(creator, {}));
const mine = creatorContests.json.contests.find((c: any) => c.submission_id === winnerSub.id);
eq('the creator’s tracker shows the win', mine?.is_winner, true);
eq('and what the win was worth', Number(mine?.prize_earned), PRIZE_MAJOR);
const creatorOverview: any = await trackerCreatorOverview(ctx(creator, {}));
eq('the creator tracker reports one win', creatorOverview.json.kpis.wins, 1);
eq('and what has actually reached their bank', creatorOverview.json.kpis.paid_out, PRIZE_MAJOR);
eq('with nothing still awaiting payout', creatorOverview.json.kpis.awaiting_payout, 0);

// ── 15. The audit trail records the high-risk transitions ──────────────────
console.log('\n-- 15. Audit trail --');
const ourIds = [client.id, creator.id, rival.id, third.id, admin.id, contestId, funding.id, withdrawalId, winnerSub.id]
  .filter(Boolean) as string[];
const allAudits = await svc.entities.AuditLog.filter({}, '-created_date', 4000).catch(() => []);
const runAudits = allAudits.filter((a: any) => {
  const blob = JSON.stringify(a);
  return blob.includes(RUN) || ourIds.some((id) => blob.includes(id));
});
const actions = new Set(runAudits.map((a: any) => a.action));
for (const expected of [
  'FUNDING_INSTRUCTIONS_VIEWED', 'FUNDING_REPORTED', 'FUNDING_VERIFIED',
  'contest.criteria.confirm', 'winner.finalize', 'winner.verification_started',
  'winner.verification_completed', 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_UNDER_REVIEW',
  'WITHDRAWAL_APPROVED', 'TRANSFER_SENT', 'PAYOUT_PAID',
]) {
  ok(`audited: ${expected}`, actions.has(expected), `${runAudits.length} audit records found for this run`);
}
ok('every audit record names an actor', runAudits.every((a: any) => Boolean(a.actor)));
ok('the money records name the permission that was used',
  runAudits.filter((a: any) => ['FUNDING_VERIFIED', 'PAYOUT_PAID'].includes(a.action))
    .every((a: any) => String(a.result || '').includes('finance.')));

// ── 16. The books balance ──────────────────────────────────────────────────
console.log('\n-- 16. Ledger integrity --');
const allTxns = await svc.entities.LedgerTransaction.filter({}, '-created_date', 4000).catch(() => []);
const runTxns = allTxns.filter((t: any) => {
  const blob = JSON.stringify(t);
  return ourIds.some((id) => blob.includes(id));
});
ok('this run posted transactions to the ledger', runTxns.length > 0, `${runTxns.length} found`);
let runCredits = 0;
let runDebits = 0;
let unbalanced = 0;
const runEntryIds: string[] = [];
for (const t of runTxns) {
  const entries = await svc.entities.LedgerEntry.filter({ transaction_id: t.id }, 'sequence', 200).catch(() => []);
  let c = 0;
  let d = 0;
  for (const e of entries) {
    runEntryIds.push(e.id);
    if (e.direction === 'CREDIT') c += Number(e.amount_minor || 0);
    else d += Number(e.amount_minor || 0);
  }
  if (c !== d) unbalanced++;
  runCredits += c;
  runDebits += d;
}
eq('every transaction in this run balances on its own', unbalanced, 0);
eq('total credits equal total debits for the run', runCredits, runDebits);
ok('and they are not both zero', runCredits > 0, String(runCredits));
console.log(`       ${runTxns.length} transactions; ${toMajor(runCredits, 'INR')} INR credited and the same debited`);

const recon: any = await financeReconcile(ctx(admin, {}));
ok('reconciliation runs', recon.status === 200, why(recon));
eq('no unbalanced transactions anywhere', recon.json.unbalanced_transactions.length, 0);
eq('no verified funding without a ledger entry', recon.json.verified_funding_without_ledger.length, 0);
eq('no paid withdrawal without a ledger entry', recon.json.paid_withdrawals_without_ledger.length, 0);

// ── 17. Cleanup, and proof that it worked ──────────────────────────────────
console.log('\n-- 17. Cleanup --');
// Every ledger row this run produced is reachable from an id it owns — an
// entry carries contest_id / funding_id / withdrawal_id, and an account its
// owner_id — so the sweep defined at the top covers them without a second list.
runTxns.forEach((t: any) => owned.push(t.id));
runEntryIds.forEach((id) => owned.push(id));
const removed = await sweep(true);
// The platform's books are shared with the rest of the database. Deleting this
// run's entries without replaying them would leave a cached balance nobody can
// explain, so each one is put back to exactly the figure found at the start.
for (const cls of PLATFORM_CLASSES) {
  const acct = await svc.entities.LedgerAccount.get(platformBefore[cls].id).catch(() => null);
  if (!acct) continue;
  const replayed = await replayBalance(svc, acct);
  await svc.entities.LedgerAccount.update(acct.id, { balance_minor: replayed.balance_minor }).catch(() => null);
}
const deletedUsers = await prisma.appUser.deleteMany({ where: { email: { contains: RUN } } });
console.log(`  removed ${removed} records and ${deletedUsers.count} accounts`);

const leftover = await sweep(false);
eq('no record created by this run survives cleanup', leftover, 0);
const leftoverUsers = await prisma.appUser.count({ where: { email: { contains: RUN } } });
eq('no account created by this run survives cleanup', leftoverUsers, 0);
const gone = await svc.entities.Contest.get(contestId).catch(() => null);
ok('the contest itself is gone', !gone, 'the contest row is still present');
for (const cls of PLATFORM_CLASSES) {
  const acct = await svc.entities.LedgerAccount.get(platformBefore[cls].id).catch(() => null);
  eq(`the platform ${cls} balance is back where it started`,
    Number(acct?.balance_minor ?? NaN), platformBefore[cls].balance);
}

console.log(`\n== ${pass} passed, ${fail} failed ==`);
if (fail) { console.log('\nFailures:'); fails.forEach((f) => console.log('  - ' + f)); }
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
