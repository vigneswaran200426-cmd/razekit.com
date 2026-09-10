// Live end-to-end verification of the beta manual payment + ledger system.
//
// Runs the §34 and §35 test scenarios against the REAL database, through the
// real handlers, and asserts the two properties that matter most:
//
//   • a repeated Verify creates ZERO additional credits
//   • a repeated Confirm creates ZERO additional debits
//
// Everything it creates is tagged with a run id and removed at the end, so it
// is safe to run against a live database without leaving residue. It never
// touches an existing record.
import { prisma, ensureFinanceConstraints } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';
import { fundingInstructions, fundingReportTransfer, fundingStatus } from '../src/functions/funding.js';
import { financeVerifyFunding, financeOverview, financeReconcile, financeUserBalances } from '../src/functions/finance.js';
import {
  withdrawalRequest, financeWithdrawalApprove, financeWithdrawalTransferSent,
  financeWithdrawalConfirm, financeWithdrawalQueue,
} from '../src/functions/withdrawals.js';
import { payoutAccountSave } from '../src/functions/payouts.js';
import { balanceOverview } from '../src/functions/balance.js';
import { ensurePayoutForWinner } from '../src/functions/payouts.js';
import { razekitBalance } from '../src/finance/balances.js';
import { toMajor } from '../src/money/core.js';

const RUN = `vbp-${Date.now().toString(36)}`;
const svc = serviceClient();

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const eq = (name: string, a: any, b: any) => check(name, a === b, `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

const ctx = (user: any, body: any = {}) => ({ user, svc, body, req: {} });

async function mkUser(kind: 'client' | 'creator' | 'admin', name: string) {
  const u = await prisma.appUser.create({
    data: {
      email: `${RUN}-${kind}@razekit.test`,
      fullName: name,
      role: kind === 'admin' ? 'admin' : 'user',
      userRole: kind === 'admin' ? 'client' : kind,
      accountStatus: 'active',
      emailVerified: true,
    },
  });
  return { id: u.id, role: u.role, user_role: u.userRole, email: u.email, full_name: u.fullName };
}

async function ledgerCount(where: any) {
  const rows = await svc.entities.LedgerTransaction.filter(where, '-created_date', 100);
  return rows.length;
}

async function main() {
  console.log(`\n══ RazeKit beta payment verification (${RUN}) ══\n`);

  const constraints = await ensureFinanceConstraints();
  check('database duplicate-protection indexes applied', constraints.ok, constraints.error || '');

  // Fee rules must exist for the quote to be meaningful.
  const rules = await svc.entities.MoneyRule.filter({ active: true }, '-created_date', 50);
  check('money rules seeded (platform fee + tax)', rules.some((r: any) => r.rule_type === 'PLATFORM_FEE'), 'run npm run seed:money');

  const client = await mkUser('client', 'Verification Client');
  const creator = await mkUser('creator', 'Verification Creator');
  const admin = await mkUser('admin', 'Verification Admin');

  // ── §34 FUNDING ──────────────────────────────────────────────────────────
  console.log('\n── §34 Funding: client pays, admin verifies ──');

  const contest = await svc.entities.Contest.create({
    title: `${RUN} verification contest`,
    description: 'Automated verification run.',
    prize_amount: 50000,
    currency: 'INR',
    settlement_region: 'IN',
    // Tier B (₹20,001–₹50,000) allows a 1–7 day contest; the fairness guard
    // rejects anything outside its prize band.
    deadline: new Date(Date.now() + 5 * 864e5).toISOString(),
    status: 'draft',
    created_by_id: client.id,
    // Criteria confirmation is the gate before funding; stamp it server-side.
    criteria_version_id: `${RUN}-criteria`,
    criteria_confirmed_at: new Date().toISOString(),
    demo: RUN,
  });

  const instr: any = await fundingInstructions(ctx(client, { contest_id: contest.id }));
  eq('funding instructions return 200', instr.status, 200);
  check('instructions carry at least one enabled payment method', (instr.json.instructions?.methods || []).length > 0);
  check('instructions include a transfer reference for matching', Boolean(instr.json.transfer_note));
  const funding = instr.json.funding;
  eq('funding starts in PAYMENT_INSTRUCTIONS_SHOWN', funding.status, 'PAYMENT_INSTRUCTIONS_SHOWN');
  const totalMinor = funding.total_amount_minor;
  console.log(`     amount due: ${toMajor(totalMinor, 'INR')} INR (prize 50000 + fee + tax)`);

  // Another client must not be able to see this funding request.
  const intruder: any = await fundingStatus(ctx(creator, { funding_id: funding.id }));
  eq('another user cannot read this funding request (IDOR)', intruder.status, 403);

  // Reporting a transfer must NOT create money.
  const before = await ledgerCount({ funding_id: funding.id });
  const utr = `UTR${RUN.toUpperCase()}001`;
  const reported: any = await fundingReportTransfer(ctx(client, {
    funding_id: funding.id, amount: toMajor(totalMinor, 'INR'), reference: utr,
    method: 'BANK_TRANSFER', transfer_date: new Date().toISOString().slice(0, 10),
  }));
  eq('report transfer returns 200', reported.status, 200);
  eq('reported transfer sits in PENDING_VERIFICATION', reported.json.funding.status, 'PENDING_VERIFICATION');
  eq('reporting a transfer creates NO ledger transaction', await ledgerCount({ funding_id: funding.id }), before);

  const contestAfterReport = await svc.entities.Contest.get(contest.id);
  eq('contest is still draft after a mere claim', contestAfterReport.status, 'draft');

  // A creator must not be able to verify anything.
  const creatorVerify: any = await financeVerifyFunding(ctx(creator, { funding_id: funding.id, bank_reference: utr }));
  eq('a creator cannot verify funding', creatorVerify.status, 403);
  const clientVerify: any = await financeVerifyFunding(ctx(client, { funding_id: funding.id, bank_reference: utr }));
  eq('a client cannot verify their own payment', clientVerify.status, 403);

  // The real verification.
  const verified: any = await financeVerifyFunding(ctx(admin, {
    funding_id: funding.id, bank_reference: `BANKREF-${RUN}`, verified_amount: toMajor(totalMinor, 'INR'), note: 'Matched on statement',
  }));
  eq('admin verification returns 200', verified.status, 200);
  eq('verified funding is VERIFIED', verified.json.funding.status, 'VERIFIED');
  eq('reconciliation classified as MATCHED', verified.json.match, 'MATCHED');
  check('a ledger credit was posted', Boolean(verified.json.ledger.credit_txn));
  check('the prize was reserved', Boolean(verified.json.ledger.reservation_txn));
  eq('the contest went live on verification', verified.json.contest_published, true);

  const creditCount = await ledgerCount({ funding_id: funding.id, txn_type: 'FUNDING_RECEIVED' });
  eq('exactly ONE credit exists', creditCount, 1);

  const contestLive = await svc.entities.Contest.get(contest.id);
  eq('contest status is now open', contestLive.status, 'open');
  eq('contest funding_status is VERIFIED', contestLive.funding_status, 'VERIFIED');

  // ── The idempotency guarantee ────────────────────────────────────────────
  const again: any = await financeVerifyFunding(ctx(admin, {
    funding_id: funding.id, bank_reference: `BANKREF-${RUN}`, verified_amount: toMajor(totalMinor, 'INR'),
  }));
  eq('a repeated verify is accepted without error', again.status, 200);
  eq('a repeated verify reports already_verified', again.json.already_verified, true);
  eq('a repeated verify creates ZERO additional credits', await ledgerCount({ funding_id: funding.id, txn_type: 'FUNDING_RECEIVED' }), 1);
  eq('a repeated verify creates ZERO additional reservations', await ledgerCount({ funding_id: funding.id, txn_type: 'PRIZE_RESERVED' }), 1);

  // Two SIMULTANEOUS verifications must not both succeed.
  const contest2 = await svc.entities.Contest.create({
    title: `${RUN} race contest`, prize_amount: 10000, currency: 'INR', settlement_region: 'IN',
    // Tier A (up to ₹20,000) allows 1–3 days.
    deadline: new Date(Date.now() + 2 * 864e5).toISOString(), status: 'draft', created_by_id: client.id,
    criteria_version_id: `${RUN}-criteria`, criteria_confirmed_at: new Date().toISOString(), demo: RUN,
  });
  const i2: any = await fundingInstructions(ctx(client, { contest_id: contest2.id }));
  const f2 = i2.json.funding;
  await fundingReportTransfer(ctx(client, {
    funding_id: f2.id, amount: toMajor(f2.total_amount_minor, 'INR'), reference: `UTR${RUN.toUpperCase()}002`,
  }));
  const raceRefs = { funding_id: f2.id, bank_reference: `RACE-${RUN}`, verified_amount: toMajor(f2.total_amount_minor, 'INR') };
  const [r1, r2]: any[] = await Promise.all([
    financeVerifyFunding(ctx(admin, { ...raceRefs })),
    financeVerifyFunding(ctx(admin, { ...raceRefs })),
  ]);
  const raceCredits = await ledgerCount({ funding_id: f2.id, txn_type: 'FUNDING_RECEIVED' });
  eq('two simultaneous verifications produce exactly ONE credit', raceCredits, 1);
  check('at least one simultaneous verification succeeded', r1.status === 200 || r2.status === 200);

  // Client balance now reflects the ledger.
  const clientBal = await razekitBalance(svc, { userId: client.id, currency: 'INR', role: 'client' });
  check('client reserved balance equals the committed prizes', clientBal.reserved_minor === 6000000,
    `reserved=${clientBal.reserved_minor}`);

  // ── §35 WITHDRAWAL ───────────────────────────────────────────────────────
  console.log('\n── §35 Withdrawal: creator requests, admin transfers, admin confirms ──');

  const submission = await svc.entities.Submission.create({
    contest_id: contest.id, title: `${RUN} entry`, status: 'submitted',
    created_by_id: creator.id, submitted_at: new Date().toISOString(), demo: RUN,
  });
  await svc.entities.Contest.update(contest.id, {
    winner_user_id: creator.id, winner_submission_id: submission.id,
    winner_selected_at: new Date().toISOString(), status: 'winner_selected',
  });
  const payout = await ensurePayoutForWinner(svc, { contest: await svc.entities.Contest.get(contest.id), submission, creatorId: creator.id });
  eq('winning a funded contest makes the prize eligible', payout.status, 'PAYOUT_ELIGIBLE');

  const bal1 = await razekitBalance(svc, { userId: creator.id, currency: 'INR', role: 'creator' });
  eq('creator available balance is the full prize', bal1.available_minor, 5000000);
  eq('creator has nothing pending yet', bal1.pending_minor, 0);
  eq('creator total equals available', bal1.total_minor, 5000000);

  // A creator cannot credit themselves through the entity API.
  let forged = false;
  try {
    const { makeEntities, userCtx } = await import('../src/entities/service.js');
    await makeEntities(userCtx(creator as any)).LedgerEntry.create({
      account_id: 'x', direction: 'CREDIT', amount_minor: 99999999, currency: 'INR',
      transaction_id: 'x', posted_at: new Date().toISOString(),
    });
    forged = true;
  } catch { /* expected */ }
  eq('a creator cannot write a ledger entry from the client API', forged, false);

  let forgedBalance = false;
  try {
    const { makeEntities, userCtx } = await import('../src/entities/service.js');
    const wallets = await svc.entities.Wallet.filter({ user_id: creator.id }, '-created_date', 1);
    if (wallets.length) {
      await makeEntities(userCtx(creator as any)).Wallet.update(wallets[0].id, { available_balance_minor: 99999999 });
      forgedBalance = true;
    }
  } catch { /* expected */ }
  eq('a creator cannot forge their own balance', forgedBalance, false);

  const noBank: any = await withdrawalRequest(ctx(creator, { amount: 50000 }));
  eq('withdrawal without bank details is refused', noBank.json?.error?.code, 'BANK_DETAILS_REQUIRED');

  const saved: any = await payoutAccountSave(ctx(creator, {
    account_holder_name: 'Verification Creator', account_number: '123456789012',
    confirm_account_number: '123456789012', ifsc: 'HDFC0001234', bank_name: 'HDFC Bank',
  }));
  eq('bank details save returns 200', saved.status, 200);
  check('saved account is returned masked', !JSON.stringify(saved.json).includes('123456789012'),
    'full account number leaked in the response');

  const tooMuch: any = await withdrawalRequest(ctx(creator, { amount: 999999 }));
  eq('withdrawing more than the balance is refused', tooMuch.json?.error?.code, 'INSUFFICIENT_BALANCE');

  const req: any = await withdrawalRequest(ctx(creator, { amount: 50000 }));
  eq('withdrawal request returns 200', req.status, 200);
  eq('withdrawal starts as REQUESTED', req.json.withdrawal.status, 'REQUESTED');
  const wid = req.json.withdrawal.id;

  const bal2 = await razekitBalance(svc, { userId: creator.id, currency: 'INR', role: 'creator' });
  eq('requesting does NOT reduce the total balance', bal2.total_minor, 5000000);
  eq('available drops to zero on request', bal2.available_minor, 0);
  eq('the amount moves into withdrawal pending', bal2.pending_minor, 5000000);
  eq('nothing is paid out yet', bal2.paid_out_minor, 0);
  eq('no debit transaction exists yet', await ledgerCount({ withdrawal_id: wid, txn_type: 'WITHDRAWAL_PAID' }), 0);

  const dup: any = await withdrawalRequest(ctx(creator, { amount: 1000 }));
  eq('a second concurrent withdrawal is refused', dup.json?.error?.code, 'WITHDRAWAL_ALREADY_OPEN');

  // Authorisation on the admin side.
  const creatorApprove: any = await financeWithdrawalApprove(ctx(creator, { withdrawal_id: wid }));
  eq('a creator cannot approve their own withdrawal', creatorApprove.status, 403);
  const creatorConfirm: any = await financeWithdrawalConfirm(ctx(creator, { withdrawal_id: wid }));
  eq('a creator cannot confirm their own payout', creatorConfirm.status, 403);

  const skipAhead: any = await financeWithdrawalConfirm(ctx(admin, { withdrawal_id: wid }));
  check('confirming before approval is refused', skipAhead.status >= 400,
    `got ${skipAhead.status} ${JSON.stringify(skipAhead.json?.error?.code)}`);
  eq('the premature confirm created no debit', await ledgerCount({ withdrawal_id: wid, txn_type: 'WITHDRAWAL_PAID' }), 0);

  const queue: any = await financeWithdrawalQueue(ctx(admin, {}));
  check('the withdrawal appears in the admin queue', queue.json.queue.some((w: any) => w.id === wid));
  check('the queue shows the creator by real name', queue.json.queue.some((w: any) => w.creator_name === 'Verification Creator'));
  check('the queue masks the bank account', queue.json.queue.every((w: any) => !String(w.bank_account_masked || '').includes('123456789012')));

  const approved: any = await financeWithdrawalApprove(ctx(admin, { withdrawal_id: wid, note: 'Balance checked' }));
  eq('approval returns 200', approved.status, 200);
  eq('withdrawal is APPROVED', approved.json.withdrawal.status, 'APPROVED');
  eq('approval creates no debit', await ledgerCount({ withdrawal_id: wid, txn_type: 'WITHDRAWAL_PAID' }), 0);

  const noRef: any = await financeWithdrawalTransferSent(ctx(admin, { withdrawal_id: wid }));
  eq('recording a transfer without a UTR is refused', noRef.json?.error?.code, 'PAYMENT_REFERENCE_REQUIRED');

  const sent: any = await financeWithdrawalTransferSent(ctx(admin, {
    withdrawal_id: wid, payment_reference: `PAYUTR-${RUN}`, transfer_date: new Date().toISOString().slice(0, 10),
  }));
  eq('recording the transfer returns 200', sent.status, 200);
  eq('withdrawal is TRANSFER_SENT', sent.json.withdrawal.status, 'TRANSFER_SENT');
  eq('recording the transfer still creates no debit', await ledgerCount({ withdrawal_id: wid, txn_type: 'WITHDRAWAL_PAID' }), 0);

  const confirmed: any = await financeWithdrawalConfirm(ctx(admin, { withdrawal_id: wid, note: 'Settled' }));
  eq('confirmation returns 200', confirmed.status, 200);
  eq('withdrawal is PAID', confirmed.json.withdrawal.status, 'PAID');
  eq('confirmation created exactly ONE debit', await ledgerCount({ withdrawal_id: wid, txn_type: 'WITHDRAWAL_PAID' }), 1);

  const confirmAgain: any = await financeWithdrawalConfirm(ctx(admin, { withdrawal_id: wid }));
  eq('a repeated confirm is accepted without error', confirmAgain.status, 200);
  eq('a repeated confirm reports already_paid', confirmAgain.json.already_paid, true);
  eq('a repeated confirm creates ZERO additional debits', await ledgerCount({ withdrawal_id: wid, txn_type: 'WITHDRAWAL_PAID' }), 1);

  const bal3 = await razekitBalance(svc, { userId: creator.id, currency: 'INR', role: 'creator' });
  eq('creator total balance is now zero', bal3.total_minor, 0);
  eq('creator available is zero', bal3.available_minor, 0);
  eq('creator pending is zero', bal3.pending_minor, 0);
  eq('creator paid out is the full prize', bal3.paid_out_minor, 5000000);

  const view: any = await balanceOverview(ctx(creator, {}));
  eq('the creator balance page loads', view.status, 200);
  eq('the balance page agrees with the ledger', view.json.balance.paid_out_minor, 5000000);
  check('the balance page exposes no raw database ids', view.json.transactions.every((t: any) => t.reference && !t.id));
  check('the transaction history shows the payout', view.json.transactions.some((t: any) => t.amount_minor === -5000000));

  // ── Ledger integrity ─────────────────────────────────────────────────────
  console.log('\n── Ledger integrity ──');
  const recon: any = await financeReconcile(ctx(admin, {}));
  eq('reconciliation returns 200', recon.status, 200);
  eq('no unbalanced transactions', recon.json.unbalanced_transactions.length, 0);
  eq('no drifted account balances', recon.json.drifted_accounts.length, 0);
  eq('no verified funding without a ledger entry', recon.json.verified_funding_without_ledger.length, 0);
  eq('no paid withdrawal without a ledger entry', recon.json.paid_withdrawals_without_ledger.length, 0);
  eq('the books are healthy', recon.json.healthy, true);

  const overview: any = await financeOverview(ctx(admin, {}));
  eq('finance overview returns 200', overview.status, 200);
  check('overview masks the destination account',
    !JSON.stringify(overview.json.destination).includes(process.env.BETA_BANK_ACCOUNT_NUMBER || '@@none@@'));
  eq('no ledger exceptions', overview.json.kpis.ledger_exceptions, 0);

  const balances: any = await financeUserBalances(ctx(admin, {}));
  eq('user balances view returns 200', balances.status, 200);

  const creatorOverview: any = await financeOverview(ctx(creator, {}));
  eq('a creator cannot read the finance dashboard', creatorOverview.status, 403);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log('\n── Cleanup ──');
  const entities = [
    'LedgerEntry', 'LedgerTransaction', 'LedgerAccount', 'ContestFunding', 'FundingReceipt',
    'FundingProof', 'ReconciliationRecord', 'WithdrawalRequest', 'Payout', 'PayoutAccount',
    'Wallet', 'Notification', 'AuditLog', 'Submission', 'Contest',
  ];
  let removed = 0;
  for (const name of entities) {
    const rows = await svc.entities[name].filter({}, '-created_date', 4000).catch(() => []);
    for (const r of rows) {
      const blob = JSON.stringify(r);
      const mine = blob.includes(RUN)
        || [client.id, creator.id, admin.id, contest.id, contest2.id].some((id) => blob.includes(id));
      if (!mine) continue;
      await svc.entities[name].delete(r.id).catch(() => {});
      removed++;
    }
  }
  await prisma.appUser.deleteMany({ where: { email: { contains: RUN } } });
  console.log(`  removed ${removed} verification records`);

  console.log(`\n══ ${pass} passed, ${fail} failed ══`);
  if (fail) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  • ${f}`);
  }
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error('\nVERIFICATION CRASHED:', e);
  await prisma.$disconnect();
  process.exit(1);
});
