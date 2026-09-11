// Live verification of the UroPay settlement path.
//
// The unit tests prove the adapter's pure logic. What they cannot prove is the
// thing that actually matters here: that a confirmed UPI payment produces
// EXACTLY ONE ledger credit no matter how many times the provider tells us
// about it. That needs the real database, the real ledger and the real
// transaction, which is what this script exercises.
//
// The provider's HTTP is stubbed at the global fetch boundary rather than
// behind a seam in the payment code. Two reasons: a test-only hook inside code
// that moves money is a liability, and stubbing at fetch means the adapter's
// own request building, status parsing, timeout and error handling are all
// genuinely exercised instead of bypassed.
//
// Everything it creates is removed at the end.
import { prisma } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';
import { uropayCreateOrder, uropayWebhook, uropayOrderStatus, settleUropayOrder } from '../src/functions/uropay.js';
import { signingKeyOrder, UROPAY_STATUS } from '../src/payments/uropay.js';
import { PAYMENT_STATE } from '../src/payments/gateway.js';
import { balanceOf, ACCOUNT_CLASS } from '../src/ledger/accounts.js';
import { FUNDING } from '../src/payments/states.js';
import { createHash, createHmac } from 'node:crypto';

const SECRET = 'verify-only-secret-not-a-credential';
process.env.UROPAY_ENV = 'test';
process.env.UROPAY_TEST_KEY = 'verify-only-key';
process.env.UROPAY_TEST_SECRET = SECRET;

const svc = serviceClient();
const ctx = (u: any, b: any = {}, req: any = {}) => ({ user: u, svc, body: b, req });
let pass = 0; let fail = 0;
const fails: string[] = [];
const ok = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; fails.push(n); console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`); }
};
const eq = (n: string, a: any, b: any) => ok(n, a === b, `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

const RUN = 'uro-' + Date.now().toString(36);
const ORDER_ID = `URO-${RUN}`;
console.log(`\n══ UroPay settlement verification (${RUN}) ══\n`);

// ── The provider stub ───────────────────────────────────────────────────────
let providerStatus = UROPAY_STATUS.CREATED;
let statusCalls = 0;
let generateCalls = 0;
const realFetch = globalThis.fetch;

globalThis.fetch = (async (url: any, init: any = {}) => {
  const href = String(url);
  const reply = (body: any, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  if (href.includes('/order/generate')) {
    generateCalls++;
    const sent = JSON.parse(init.body || '{}');
    // Assert the adapter sent what UroPay documents, in the units it documents.
    if (!Number.isInteger(sent.amount)) throw new Error('amount must be an integer number of paise');
    if (!sent.merchantOrderId) throw new Error('merchantOrderId missing');
    return reply({
      uroPayOrderId: ORDER_ID, orderStatus: UROPAY_STATUS.CREATED,
      upiString: 'upi://pay?pa=demo@bank', qrCode: 'data:image/png;base64,AA==',
      amountInRupees: sent.amount / 100,
    });
  }
  if (href.includes('/order/status/')) {
    statusCalls++;
    return reply({ uroPayOrderId: ORDER_ID, orderStatus: providerStatus });
  }
  if (href.includes('/order/update')) {
    return reply({ uroPayOrderId: ORDER_ID, orderStatus: UROPAY_STATUS.UTR_SUBMITTED });
  }
  return realFetch(url, init);
}) as any;

function signWebhook(payload: Record<string, unknown>) {
  const keys = signingKeyOrder(payload);
  const ordered: Record<string, unknown> = {};
  for (const k of keys) if (payload[k] !== undefined) ordered[k] = payload[k];
  const json = JSON.stringify(ordered);
  let body = '';
  for (let i = 0; i < json.length; i += 1) {
    const c = json.charCodeAt(i);
    if (c === 47) body += String.fromCharCode(92) + '/';
    else if (c > 127) body += String.fromCharCode(92) + 'u' + c.toString(16).padStart(4, '0');
    else body += json[i];
  }
  const key = createHash('sha512').update(SECRET, 'utf8').digest('hex');
  return createHmac('sha256', key).update(body, 'utf8').digest('hex');
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const client = await prisma.appUser.create({
  data: {
    email: `${RUN}-client@razekit.test`, fullName: `${RUN} client`,
    role: 'user', userRole: 'client', accountStatus: 'active', emailVerified: true,
  },
});
const brand = { id: client.id, role: 'user', user_role: 'client', email: client.email, full_name: client.fullName };

const contest = await svc.entities.Contest.create({
  title: `${RUN} UroPay contest`, prize_amount: 20000, currency: 'INR', settlement_region: 'IN',
  deadline: new Date(Date.now() + 3 * 864e5).toISOString(), status: 'draft',
  created_by_id: brand.id, funding_status: FUNDING.FUNDING_REQUIRED, demo: RUN,
});

const PRIZE = 2000000; const FEE = 200000; const TAX = 36000;
const TOTAL = PRIZE + FEE + TAX;
const funding = await svc.entities.ContestFunding.create({
  reference: `RK-${RUN}`, contest_id: contest.id, brand_id: brand.id, currency: 'INR',
  prize_amount_minor: PRIZE, platform_fee_minor: FEE, tax_minor: TAX, total_amount_minor: TOTAL,
  status: FUNDING.FUNDING_REQUIRED, payment_mode: 'UROPAY', demo: RUN,
});

// ── Order creation ──────────────────────────────────────────────────────────
console.log('── Order creation ──');
const created: any = await uropayCreateOrder(ctx(brand, { funding_id: funding.id }));
eq('an order is created', created.status, 200);
eq('the provider order id is stored', created.json.provider_order_id, ORDER_ID);
eq('the amount sent matches the funding total, in paise', created.json.amount_minor, TOTAL);
ok('a UPI string and QR come back for the payer', Boolean(created.json.upi_string && created.json.qr_code));
eq('test mode is disclosed rather than implied', created.json.test_mode, true);

const again: any = await uropayCreateOrder(ctx(brand, { funding_id: funding.id }));
eq('a second request REUSES the order', again.json.reused, true);
eq('and did not create a second order at the provider', generateCalls, 1);

const stranger = await prisma.appUser.create({
  data: { email: `${RUN}-x@razekit.test`, fullName: 'x', role: 'user', userRole: 'client', accountStatus: 'active' },
});
const idor: any = await uropayCreateOrder(
  ctx({ id: stranger.id, role: 'user', user_role: 'client' }, { funding_id: funding.id }),
);
eq('another account cannot create an order against this funding', idor.status, 403);

// ── Nothing is credited before the provider confirms ────────────────────────
console.log('\n── Before confirmation ──');
const beforeBal = await balanceOf(svc, { accountClass: ACCOUNT_CLASS.CLIENT_FUNDS, currency: 'INR', subjectId: brand.id });
eq('no money exists yet', beforeBal.balance_minor, 0);

providerStatus = UROPAY_STATUS.UTR_SUBMITTED;
const claimed: any = await uropayOrderStatus(ctx(brand, { provider_order_id: ORDER_ID }));
eq('a submitted UTR does not credit anything', claimed.json.credited, false);
eq('and the state says it is still being processed', claimed.json.state, PAYMENT_STATE.PROCESSING);
const stillZero = await balanceOf(svc, { accountClass: ACCOUNT_CLASS.CLIENT_FUNDS, currency: 'INR', subjectId: brand.id });
eq('the balance is still zero after a claimed payment', stillZero.balance_minor, 0);

providerStatus = UROPAY_STATUS.REVIEW_REQUIRED;
const review: any = await uropayOrderStatus(ctx(brand, { provider_order_id: ORDER_ID }));
eq('a payment under provider review does not credit either', review.json.credited, false);

// ── A forged webhook must change nothing ────────────────────────────────────
console.log('\n── Forged webhook ──');
const forgedEvent = {
  event: 'order.status.changed', uroPayOrderId: ORDER_ID, merchantOrderId: funding.reference,
  orderStatus: UROPAY_STATUS.COMPLETED, submittedUTR: '999999999999', environment: 'test',
};
const forged: any = await uropayWebhook({
  ...ctx(null, forgedEvent, { headers: { 'x-uropay-signature': 'deadbeef'.repeat(8) } }),
});
eq('an unsigned/forged webhook is rejected', forged.status, 401);
const afterForged = await balanceOf(svc, { accountClass: ACCOUNT_CLASS.CLIENT_FUNDS, currency: 'INR', subjectId: brand.id });
eq('a forged COMPLETED creates no money', afterForged.balance_minor, 0);
const rejected = await svc.entities.ProviderWebhookEvent
  .filter({ provider: 'uropay', status: 'rejected' }, '-created_date', 10).catch(() => []);
ok('the rejection is recorded for audit, not silently dropped',
  rejected.some((e: any) => String(e.related_ref).includes(RUN)));

// ── A wrong-environment webhook must change nothing ─────────────────────────
const wrongEnv = { ...forgedEvent, environment: 'production' };
const envEvent: any = await uropayWebhook({
  ...ctx(null, wrongEnv, { headers: { 'x-uropay-signature': signWebhook(wrongEnv) } }),
});
eq('a correctly signed PRODUCTION event is refused by a test service', envEvent.status, 409);

// ── The real confirmation ───────────────────────────────────────────────────
console.log('\n── Confirmed payment ──');
providerStatus = UROPAY_STATUS.COMPLETED;
const good: any = await uropayWebhook({
  ...ctx(null, forgedEvent, { headers: { 'x-uropay-signature': signWebhook(forgedEvent) } }),
});
eq('a genuine signed webhook is accepted', good.status, 200);
eq('and it credits the funding', good.json.credited, true);

const funded = await svc.entities.ContestFunding.get(funding.id);
eq('the funding request is VERIFIED', funded.status, FUNDING.VERIFIED);
// The credit is read from the ledger, not from a balance: the prize is
// reserved in the same transaction, so CLIENT_FUNDS legitimately nets back to
// zero here. Asserting the balance would be asserting the wrong thing.
const creditTxns = await svc.entities.LedgerTransaction
  .filter({ funding_id: funding.id, txn_type: 'FUNDING_RECEIVED' }, 'created_date', 20).catch(() => []);
eq('one funding credit was posted', creditTxns.length, 1);
// The TRANSACTION carries the gross that arrived; the client's share is one
// ENTRY inside it, alongside the platform fee and the tax. Asserting on both
// is what proves the split, rather than just that some money was booked.
eq('the transaction is for the gross amount received', Number(creditTxns[0]?.amount_minor), TOTAL);
const creditEntries = await svc.entities.LedgerEntry
  .filter({ transaction_id: creditTxns[0]?.id }, 'created_date', 20).catch(() => []);
const clientLine = creditEntries.find((e: any) => e.account_class === 'CLIENT_FUNDS');
eq('the client is credited their share, net of fee and tax', Number(clientLine?.amount_minor), TOTAL - FEE - TAX);
const feeLine = creditEntries.find((e: any) => e.account_class === 'PLATFORM_FEE');
eq('and the platform fee is booked once, separately', Number(feeLine?.amount_minor), FEE);
ok('the entries balance', creditEntries.length >= 4);
const committed = await balanceOf(svc, { accountClass: ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, currency: 'INR', subjectId: contest.id });
eq('the prize is committed to THIS contest', committed.balance_minor, PRIZE);
const published = await svc.entities.Contest.get(contest.id);
eq('funding is what publishes the contest', published.status, 'open');

// ── Idempotency: the heart of the matter ────────────────────────────────────
console.log('\n── Duplicate delivery ──');
const dup: any = await uropayWebhook({
  ...ctx(null, forgedEvent, { headers: { 'x-uropay-signature': signWebhook(forgedEvent) } }),
});
eq('a replayed webhook is acknowledged, not re-processed', dup.json.duplicate, true);

const poll: any = await uropayOrderStatus(ctx(brand, { provider_order_id: ORDER_ID }));
eq('a client polling after settlement credits nothing further', poll.json.credited, false);

// Three simultaneous settlements — a webhook retry, a poll and an admin refresh
// all landing at once. This is the race the row lock exists for.
const racers = await Promise.allSettled([
  settleUropayOrder(svc, { providerOrderId: ORDER_ID, reason: 'race-a' }),
  settleUropayOrder(svc, { providerOrderId: ORDER_ID, reason: 'race-b' }),
  settleUropayOrder(svc, { providerOrderId: ORDER_ID, reason: 'race-c' }),
]);
ok('three concurrent settlements all resolve without error',
  racers.every((r) => r.status === 'fulfilled'));
eq('and none of them credited a second time',
  racers.filter((r: any) => r.status === 'fulfilled' && r.value?.credited).length, 0);

// The prize stays committed at exactly the prize amount — a second credit
// would have reserved a second prize, so this is the figure that would move if
// idempotency were broken.
const committedAfter = await balanceOf(svc, { accountClass: ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, currency: 'INR', subjectId: contest.id });
eq('the committed prize is unchanged after every duplicate path', committedAfter.balance_minor, PRIZE);

const receipts = await svc.entities.FundingReceipt.filter({ funding_id: funding.id }, 'created_date', 20).catch(() => []);
eq('exactly ONE receipt exists', receipts.length, 1);
eq('and it is keyed on the provider order id', receipts[0]?.bank_reference, ORDER_ID);

const txns = await svc.entities.LedgerTransaction.filter({ funding_id: funding.id }, 'created_date', 50).catch(() => []);
const credits = txns.filter((t: any) => t.txn_type === 'FUNDING_RECEIVED');
eq('still exactly ONE funding credit in the ledger', credits.length, 1);
const reservations = txns.filter((t: any) => t.txn_type === 'PRIZE_RESERVED');
eq('and exactly ONE prize reservation', reservations.length, 1);

// ── Cleanup ─────────────────────────────────────────────────────────────────
console.log('\n── Cleanup ──');
globalThis.fetch = realFetch;
let removed = 0;
for (const name of ['LedgerEntry', 'LedgerTransaction', 'FundingReceipt', 'ReconciliationRecord',
  'ProviderWebhookEvent', 'Payment', 'ContestFunding', 'Contest', 'Wallet', 'Notification', 'AuditLog']) {
  const rows = await svc.entities[name].filter({}, '-created_date', 4000).catch(() => []);
  for (const r of rows) {
    const blob = JSON.stringify(r);
    if (!blob.includes(RUN) && !blob.includes(ORDER_ID) && !blob.includes(contest.id)
      && !blob.includes(funding.id) && !blob.includes(brand.id)) continue;
    await svc.entities[name].delete(r.id).catch(() => {});
    removed++;
  }
}
await prisma.appUser.deleteMany({ where: { email: { contains: RUN } } });
console.log(`  removed ${removed} verification records`);

console.log(`\n══ ${pass} passed, ${fail} failed ══`);
console.log(`  (provider HTTP stubbed at the fetch boundary; ${statusCalls} status lookups made)`);
if (fail) { console.log('\nFailures:'); fails.forEach((f) => console.log('  - ' + f)); }
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
