// Beta manual payment + ledger — unit tests.
//
// These are pure: no database, no network. The ledger tests run against a small
// in-memory fake of the entity service, which is enough to assert real
// double-entry behaviour (balance, immutability, idempotency) without Postgres.
// The live end-to-end run lives in scripts/verify-beta-payments.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FUNDING, WITHDRAWAL, PAYOUT, REFUND, RECON,
  FUNDING_COPY, WITHDRAWAL_COPY, PAYOUT_COPY,
  FUNDING_IN_QUEUE, FUNDING_AWAITING_MONEY, FUNDING_MONEY_RECEIVED, WITHDRAWAL_RESERVING,
  canTransitionFunding, assertFundingTransition,
  canTransitionWithdrawal, assertWithdrawalTransition,
  canTransitionPayout, canTransitionRefund,
  classifyReconciliation, isFunded,
} from '../src/payments/states.js';
import { maskAccountNumber, maskIfsc, maskUpi, last4, betaNotice } from '../src/payments/config.js';
import {
  isValidUpiId, isValidIfsc, isValidAccountNumber,
  enabledMethods, maskedSettings, instructionsFor, auditActionsFor, PAYMENT_METHOD,
} from '../src/payments/settings.js';
import { ACCOUNT_CLASS, accountCode, normalSide, applyToBalance, balanceOf } from '../src/ledger/accounts.js';
import { postTransaction, reverseTransaction, DIRECTION, ENTRY_TYPE, TXN_TYPE, LedgerError } from '../src/ledger/post.js';
import {
  recordFundingVerified, reservePrize, releasePrize, createPayoutLiability,
  reserveWithdrawal, releaseWithdrawal, recordWithdrawalPaid, approveRefund, recordRefundPaid,
} from '../src/ledger/events.js';
import { FINANCE_PERMISSION, ALL_FINANCE_PERMISSIONS, permissionsFor, hasPermission } from '../src/finance/permissions.js';
import { razekitBalance, MIN_WITHDRAWAL_MINOR } from '../src/finance/balances.js';
import { toMinor, toMajor, feeFromBps } from '../src/money/core.js';

// ── In-memory entity service ────────────────────────────────────────────────
// Mirrors the real service closely enough for the ledger: equality filtering,
// created_date / sequence ordering, and a monotonic clock so ordering is stable
// regardless of how fast the test runs.
function fakeSvc() {
  const store: Record<string, any[]> = {};
  let seq = 0;
  const updates: Record<string, number> = {};
  const deletes: Record<string, number> = {};

  const table = (name: string) => (store[name] ||= []);

  const methods = (name: string) => ({
    async filter(query: any = {}, sort?: string, limit?: number) {
      let rows = table(name).filter((r) =>
        Object.entries(query || {}).every(([k, v]) => v === undefined || r[k] === v));
      if (sort) {
        const desc = sort.startsWith('-');
        const field = desc ? sort.slice(1) : sort;
        rows = [...rows].sort((a, b) => {
          const av = a[field], bv = b[field];
          if (av === bv) return 0;
          return (av < bv ? -1 : 1) * (desc ? -1 : 1);
        });
      }
      return limit ? rows.slice(0, limit) : rows;
    },
    async get(id: string) {
      const row = table(name).find((r) => r.id === id);
      if (!row) throw new Error(`${name} not found`);
      return row;
    },
    async create(obj: any) {
      const row = { ...obj, id: `${name}-${++seq}`, created_date: String(++seq).padStart(8, '0') };
      table(name).push(row);
      return row;
    },
    async update(id: string, patch: any) {
      updates[name] = (updates[name] || 0) + 1;
      const row = table(name).find((r) => r.id === id);
      if (!row) throw new Error(`${name} not found`);
      Object.assign(row, patch);
      return row;
    },
    async delete(id: string) {
      deletes[name] = (deletes[name] || 0) + 1;
      store[name] = table(name).filter((r) => r.id !== id);
      return {};
    },
  });

  return {
    entities: new Proxy({}, { get: (_t, prop: string) => methods(prop) }) as any,
    _store: store,
    _updates: updates,
    _deletes: deletes,
  };
}

const INR = 'INR';
const bal = async (svc: any, accountClass: string, subjectId?: string) =>
  (await balanceOf(svc, { accountClass, currency: INR, subjectId })).balance_minor;

const funding = (o: any = {}) => ({
  id: 'F1', reference: 'RK-FND-1', contest_id: 'C1', brand_id: 'CLIENT1', currency: INR,
  prize_amount_minor: 5000000, platform_fee_minor: 500000, tax_minor: 90000,
  total_amount_minor: 5590000, ...o,
});

// ═══ Money ordering — the core guarantee ════════════════════════════════════

test('a verified receipt is split into client funds, platform fee and tax, and balances', async () => {
  const svc = fakeSvc();
  const f = funding();
  const { transaction, entries } = await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'UTR1' });

  const debits = entries.filter((e: any) => e.direction === 'DEBIT').reduce((a: number, e: any) => a + e.amount_minor, 0);
  const credits = entries.filter((e: any) => e.direction === 'CREDIT').reduce((a: number, e: any) => a + e.amount_minor, 0);
  assert.equal(debits, credits, 'a transaction must balance');
  assert.equal(transaction.amount_minor, f.total_amount_minor);

  assert.equal(await bal(svc, ACCOUNT_CLASS.BANK_SETTLEMENT), 5590000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.CLIENT_FUNDS, 'CLIENT1'), 5000000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.PLATFORM_FEE), 500000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.TAX_PAYABLE), 90000);
});

test('a receipt smaller than the fees is refused rather than creating a negative client share', async () => {
  const svc = fakeSvc();
  await assert.rejects(
    () => recordFundingVerified(svc, { funding: funding(), actorId: 'A1', amountMinor: 1000, bankReference: 'UTR-SMALL' }),
    (e: any) => e.code === 'FUNDING_BELOW_FEES'
  );
  assert.equal((svc._store.LedgerTransaction || []).length, 0, 'nothing was written');
});

test('reserving a prize moves client funds into a contest commitment', async () => {
  const svc = fakeSvc();
  const f = funding();
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'UTR1' });
  await reservePrize(svc, { funding: f, actorId: 'A1' });

  assert.equal(await bal(svc, ACCOUNT_CLASS.CLIENT_FUNDS, 'CLIENT1'), 0);
  assert.equal(await bal(svc, ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, 'C1'), 5000000);
});

test('releasing a prize returns it to the client, not to RazeKit', async () => {
  const svc = fakeSvc();
  const f = funding();
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'UTR1' });
  await reservePrize(svc, { funding: f, actorId: 'A1' });
  await releasePrize(svc, { funding: f, actorId: 'A1', reason: 'Contest cancelled' });

  assert.equal(await bal(svc, ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, 'C1'), 0);
  assert.equal(await bal(svc, ACCOUNT_CLASS.CLIENT_FUNDS, 'CLIENT1'), 5000000);
});

test('winning turns a contest commitment into a debt owed to a named creator', async () => {
  const svc = fakeSvc();
  const f = funding();
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'UTR1' });
  await reservePrize(svc, { funding: f, actorId: 'A1' });
  await createPayoutLiability(svc, {
    payout: { id: 'P1', reference: 'RK-PAY-1', creator_id: 'CREATOR1', currency: INR, amount_minor: 5000000 },
    contestId: 'C1', brandId: 'CLIENT1',
  });

  assert.equal(await bal(svc, ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, 'C1'), 0);
  assert.equal(await bal(svc, ACCOUNT_CLASS.PAYOUT_LIABILITY, 'CREATOR1'), 5000000);
});

test('requesting a withdrawal RESERVES the amount and does not reduce the total owed', async () => {
  const svc = fakeSvc();
  await createPayoutLiability(svc, {
    payout: { id: 'P1', reference: 'RK-PAY-1', creator_id: 'CREATOR1', currency: INR, amount_minor: 5000000 },
    contestId: 'C1', brandId: 'CLIENT1',
  });
  const w = { id: 'W1', reference: 'RK-WDR-1', user_id: 'CREATOR1', currency: INR, amount_minor: 5000000 };
  await reserveWithdrawal(svc, { withdrawal: w, actorId: 'CREATOR1' });

  const available = await bal(svc, ACCOUNT_CLASS.PAYOUT_LIABILITY, 'CREATOR1');
  const pending = await bal(svc, ACCOUNT_CLASS.WITHDRAWAL_PENDING, 'CREATOR1');
  assert.equal(available, 0, 'available drops');
  assert.equal(pending, 5000000, 'the amount is reserved, not gone');
  assert.equal(available + pending, 5000000, 'the creator is owed exactly as much as before');
  // No money left RazeKit.
  assert.equal(await bal(svc, ACCOUNT_CLASS.BANK_SETTLEMENT), 0);
});

test('cancelling a withdrawal returns the reservation to the creator', async () => {
  const svc = fakeSvc();
  await createPayoutLiability(svc, {
    payout: { id: 'P1', reference: 'RK-PAY-1', creator_id: 'CREATOR1', currency: INR, amount_minor: 5000000 },
    contestId: 'C1', brandId: 'CLIENT1',
  });
  const w = { id: 'W1', reference: 'RK-WDR-1', user_id: 'CREATOR1', currency: INR, amount_minor: 5000000 };
  await reserveWithdrawal(svc, { withdrawal: w, actorId: 'CREATOR1' });
  await releaseWithdrawal(svc, { withdrawal: w, actorId: 'A1', reason: 'cancelled' });

  assert.equal(await bal(svc, ACCOUNT_CLASS.PAYOUT_LIABILITY, 'CREATOR1'), 5000000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.WITHDRAWAL_PENDING, 'CREATOR1'), 0);
});

test('confirming a transfer is the debit, and it is the only thing that reduces the balance', async () => {
  const svc = fakeSvc();
  const f = funding();
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'UTR1' });
  await reservePrize(svc, { funding: f, actorId: 'A1' });
  await createPayoutLiability(svc, {
    payout: { id: 'P1', reference: 'RK-PAY-1', creator_id: 'CREATOR1', currency: INR, amount_minor: 5000000 },
    contestId: 'C1', brandId: 'CLIENT1',
  });
  const w = { id: 'W1', reference: 'RK-WDR-1', user_id: 'CREATOR1', currency: INR, amount_minor: 5000000 };
  await reserveWithdrawal(svc, { withdrawal: w, actorId: 'CREATOR1' });

  const bankBefore = await bal(svc, ACCOUNT_CLASS.BANK_SETTLEMENT);
  await recordWithdrawalPaid(svc, { withdrawal: w, actorId: 'A1' });

  assert.equal(await bal(svc, ACCOUNT_CLASS.WITHDRAWAL_PENDING, 'CREATOR1'), 0);
  assert.equal(await bal(svc, ACCOUNT_CLASS.PAYOUT_LIABILITY, 'CREATOR1'), 0);
  assert.equal(await bal(svc, ACCOUNT_CLASS.BANK_SETTLEMENT), bankBefore - 5000000);
});

test('the full journey leaves every account where it should', async () => {
  const svc = fakeSvc();
  const f = funding();
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'UTR1' });
  await reservePrize(svc, { funding: f, actorId: 'A1' });
  await createPayoutLiability(svc, {
    payout: { id: 'P1', reference: 'RK-PAY-1', creator_id: 'CREATOR1', currency: INR, amount_minor: 5000000 },
    contestId: 'C1', brandId: 'CLIENT1',
  });
  const w = { id: 'W1', reference: 'RK-WDR-1', user_id: 'CREATOR1', currency: INR, amount_minor: 5000000 };
  await reserveWithdrawal(svc, { withdrawal: w, actorId: 'CREATOR1' });
  await recordWithdrawalPaid(svc, { withdrawal: w, actorId: 'A1' });

  // RazeKit keeps the fee and the tax; the prize passed straight through.
  assert.equal(await bal(svc, ACCOUNT_CLASS.BANK_SETTLEMENT), 590000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.PLATFORM_FEE), 500000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.TAX_PAYABLE), 90000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.CLIENT_FUNDS, 'CLIENT1'), 0);
  assert.equal(await bal(svc, ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, 'C1'), 0);
  assert.equal(await bal(svc, ACCOUNT_CLASS.PAYOUT_LIABILITY, 'CREATOR1'), 0);
  assert.equal(await bal(svc, ACCOUNT_CLASS.WITHDRAWAL_PENDING, 'CREATOR1'), 0);
});

test('a refund moves the client balance out through a clearing account, never straight to the bank', async () => {
  const svc = fakeSvc();
  const f = funding();
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'UTR1' });
  await approveRefund(svc, { funding: f, amountMinor: 5000000, refundFees: false, actorId: 'A1' });

  assert.equal(await bal(svc, ACCOUNT_CLASS.CLIENT_FUNDS, 'CLIENT1'), 0);
  assert.equal(await bal(svc, ACCOUNT_CLASS.REFUND_CLEARING), 5000000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.BANK_SETTLEMENT), 5590000, 'the bank has not moved yet');

  await recordRefundPaid(svc, { funding: f, amountMinor: 5000000, actorId: 'A1' });
  assert.equal(await bal(svc, ACCOUNT_CLASS.REFUND_CLEARING), 0);
  assert.equal(await bal(svc, ACCOUNT_CLASS.BANK_SETTLEMENT), 590000);
});

// ═══ Immutability, idempotency, duplicate protection ════════════════════════

test('an unbalanced transaction is refused and nothing is written', async () => {
  const svc = fakeSvc();
  await assert.rejects(
    () => postTransaction(svc, {
      txnType: TXN_TYPE.ADJUSTMENT, currency: INR,
      lines: [
        { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: DIRECTION.DEBIT, amountMinor: 100 },
        { accountClass: ACCOUNT_CLASS.PLATFORM_FEE, direction: DIRECTION.CREDIT, amountMinor: 99 },
      ],
    }),
    (e: any) => e instanceof LedgerError && e.code === 'LEDGER_UNBALANCED'
  );
  assert.equal((svc._store.LedgerTransaction || []).length, 0);
  assert.equal((svc._store.LedgerEntry || []).length, 0);
});

test('zero, negative and non-finite amounts are refused', async () => {
  const svc = fakeSvc();
  for (const bad of [0, -1, NaN, Infinity]) {
    await assert.rejects(
      () => postTransaction(svc, {
        txnType: TXN_TYPE.ADJUSTMENT, currency: INR,
        lines: [
          { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: DIRECTION.DEBIT, amountMinor: bad },
          { accountClass: ACCOUNT_CLASS.PLATFORM_FEE, direction: DIRECTION.CREDIT, amountMinor: bad },
        ],
      }),
      (e: any) => e.code === 'LEDGER_INVALID_AMOUNT' || e.code === 'LEDGER_AMOUNT_TOO_LARGE',
      `amount ${bad} should be refused`
    );
  }
});

test('a direction other than DEBIT or CREDIT is refused', async () => {
  const svc = fakeSvc();
  await assert.rejects(
    () => postTransaction(svc, {
      txnType: TXN_TYPE.ADJUSTMENT, currency: INR,
      lines: [
        { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: 'SIDEWAYS', amountMinor: 100 },
        { accountClass: ACCOUNT_CLASS.PLATFORM_FEE, direction: DIRECTION.CREDIT, amountMinor: 100 },
      ],
    }),
    (e: any) => e.code === 'LEDGER_INVALID_DIRECTION'
  );
});

test('a transaction needs at least two lines', async () => {
  const svc = fakeSvc();
  await assert.rejects(
    () => postTransaction(svc, {
      txnType: TXN_TYPE.ADJUSTMENT, currency: INR,
      lines: [{ accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: DIRECTION.DEBIT, amountMinor: 100 }],
    }),
    (e: any) => e.code === 'LEDGER_UNBALANCED'
  );
});

test('replaying an idempotency key returns the original and creates no second entry', async () => {
  const svc = fakeSvc();
  const args: any = {
    txnType: TXN_TYPE.ADJUSTMENT, currency: INR, idempotencyKey: 'same-key', reason: 'x',
    lines: [
      { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: DIRECTION.DEBIT, amountMinor: 100 },
      { accountClass: ACCOUNT_CLASS.PLATFORM_FEE, direction: DIRECTION.CREDIT, amountMinor: 100 },
    ],
  };
  const first = await postTransaction(svc, args);
  const second = await postTransaction(svc, args);

  assert.equal(second.replayed, true);
  assert.equal(second.transaction.id, first.transaction.id);
  assert.equal((svc._store.LedgerTransaction || []).length, 1);
  assert.equal((svc._store.LedgerEntry || []).length, 2);
  assert.equal(await bal(svc, ACCOUNT_CLASS.PLATFORM_FEE), 100, 'the balance did not double');
});

test('verifying the same bank reference twice creates exactly ONE credit', async () => {
  const svc = fakeSvc();
  const f = funding();
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'UTR-ABC' });
  const again = await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'utr-abc' });

  assert.equal(again.replayed, true, 'the reference is matched case-insensitively');
  assert.equal((svc._store.LedgerTransaction || []).length, 1);
  assert.equal(await bal(svc, ACCOUNT_CLASS.BANK_SETTLEMENT), 5590000);
});

test('a DIFFERENT bank reference is a legitimate second receipt (a top-up after a shortfall)', async () => {
  const svc = fakeSvc();
  const f = funding();
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', amountMinor: 3000000, bankReference: 'UTR-1' });
  // The second receipt must not re-charge the fee and tax.
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', amountMinor: 2590000, bankReference: 'UTR-2', bookFees: false });

  assert.equal((svc._store.LedgerTransaction || []).length, 2);
  assert.equal(await bal(svc, ACCOUNT_CLASS.BANK_SETTLEMENT), 5590000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.PLATFORM_FEE), 500000, 'the fee is charged once, not per receipt');
  assert.equal(await bal(svc, ACCOUNT_CLASS.TAX_PAYABLE), 90000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.CLIENT_FUNDS, 'CLIENT1'), 5000000);
});

test('confirming a payout twice creates exactly ONE debit', async () => {
  const svc = fakeSvc();
  await createPayoutLiability(svc, {
    payout: { id: 'P1', reference: 'RK-PAY-1', creator_id: 'CREATOR1', currency: INR, amount_minor: 100000 },
    contestId: 'C1', brandId: 'CLIENT1',
  });
  const w = { id: 'W1', reference: 'RK-WDR-1', user_id: 'CREATOR1', currency: INR, amount_minor: 100000 };
  await reserveWithdrawal(svc, { withdrawal: w, actorId: 'CREATOR1' });

  await recordWithdrawalPaid(svc, { withdrawal: w, actorId: 'A1' });
  const second = await recordWithdrawalPaid(svc, { withdrawal: w, actorId: 'A1' });

  assert.equal(second.replayed, true);
  const paid = (svc._store.LedgerTransaction || []).filter((t: any) => t.txn_type === TXN_TYPE.WITHDRAWAL_PAID);
  assert.equal(paid.length, 1);
  assert.equal(await bal(svc, ACCOUNT_CLASS.BANK_SETTLEMENT), -100000, 'the bank was debited once');
});

test('a reversal is a new mirror transaction; the original is never altered', async () => {
  const svc = fakeSvc();
  const posted = await postTransaction(svc, {
    txnType: TXN_TYPE.ADJUSTMENT, currency: INR,
    lines: [
      { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: DIRECTION.DEBIT, amountMinor: 700 },
      { accountClass: ACCOUNT_CLASS.PLATFORM_FEE, direction: DIRECTION.CREDIT, amountMinor: 700 },
    ],
  });
  const originalEntries = (svc._store.LedgerEntry || [])
    .filter((e: any) => e.transaction_id === posted.transaction.id)
    .map((e: any) => ({ direction: e.direction, amount_minor: e.amount_minor }));

  await reverseTransaction(svc, { transactionId: posted.transaction.id, reason: 'wrong account', actorId: 'A1' });

  const afterEntries = (svc._store.LedgerEntry || [])
    .filter((e: any) => e.transaction_id === posted.transaction.id)
    .map((e: any) => ({ direction: e.direction, amount_minor: e.amount_minor }));
  assert.deepEqual(afterEntries, originalEntries, 'the original entries are untouched');
  assert.equal(posted.transaction.amount_minor, 700, 'the original amount is untouched');
  assert.equal(await bal(svc, ACCOUNT_CLASS.PLATFORM_FEE), 0, 'the reversal nets it out');
  assert.equal((svc._store.LedgerTransaction || []).length, 2, 'history keeps both');
});

test('a reversal cannot itself be reversed', async () => {
  const svc = fakeSvc();
  const posted = await postTransaction(svc, {
    txnType: TXN_TYPE.ADJUSTMENT, currency: INR,
    lines: [
      { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: DIRECTION.DEBIT, amountMinor: 500 },
      { accountClass: ACCOUNT_CLASS.PLATFORM_FEE, direction: DIRECTION.CREDIT, amountMinor: 500 },
    ],
  });
  const rev = await reverseTransaction(svc, { transactionId: posted.transaction.id, reason: 'mistake', actorId: 'A1' });
  await assert.rejects(
    () => reverseTransaction(svc, { transactionId: rev.transaction.id, reason: 'again', actorId: 'A1' }),
    (e: any) => e.code === 'LEDGER_CANNOT_REVERSE_REVERSAL'
  );
});

test('reversing the same transaction twice returns the existing reversal', async () => {
  const svc = fakeSvc();
  const posted = await postTransaction(svc, {
    txnType: TXN_TYPE.ADJUSTMENT, currency: INR,
    lines: [
      { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: DIRECTION.DEBIT, amountMinor: 500 },
      { accountClass: ACCOUNT_CLASS.PLATFORM_FEE, direction: DIRECTION.CREDIT, amountMinor: 500 },
    ],
  });
  const a = await reverseTransaction(svc, { transactionId: posted.transaction.id, reason: 'mistake', actorId: 'A1' });
  const b = await reverseTransaction(svc, { transactionId: posted.transaction.id, reason: 'mistake', actorId: 'A1' });
  assert.equal(b.transaction.id, a.transaction.id);
  assert.equal((svc._store.LedgerTransaction || []).length, 2);
});

test('no money event ever updates or deletes a ledger entry', async () => {
  const svc = fakeSvc();
  const f = funding();
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'UTR1' });
  await reservePrize(svc, { funding: f, actorId: 'A1' });
  await releasePrize(svc, { funding: f, actorId: 'A1', reason: 'x' });
  await approveRefund(svc, { funding: f, amountMinor: 5000000, actorId: 'A1' });

  assert.equal(svc._updates.LedgerEntry, undefined, 'entries are append-only');
  assert.equal(svc._deletes.LedgerEntry, undefined, 'entries are never deleted');
  assert.equal(svc._deletes.LedgerTransaction, undefined, 'transactions are never deleted');
});

test('each entry records the running balance of its own account', async () => {
  const svc = fakeSvc();
  const f = funding();
  await recordFundingVerified(svc, { funding: f, actorId: 'A1', bankReference: 'UTR1' });
  await reservePrize(svc, { funding: f, actorId: 'A1' });

  const clientEntries = (svc._store.LedgerEntry || [])
    .filter((e: any) => e.account_class === ACCOUNT_CLASS.CLIENT_FUNDS)
    .sort((a: any, b: any) => (a.created_date < b.created_date ? -1 : 1));
  assert.deepEqual(clientEntries.map((e: any) => e.balance_after_minor), [5000000, 0]);
});

// ═══ State machines ═════════════════════════════════════════════════════════

test('funding cannot skip verification', () => {
  assert.equal(canTransitionFunding(FUNDING.FUNDING_REQUIRED, FUNDING.VERIFIED), false);
  assert.equal(canTransitionFunding(FUNDING.PAYMENT_INSTRUCTIONS_SHOWN, FUNDING.VERIFIED), false);
  assert.equal(canTransitionFunding(FUNDING.TRANSFER_REPORTED, FUNDING.VERIFIED), false);
  assert.throws(() => assertFundingTransition(FUNDING.TRANSFER_REPORTED, FUNDING.VERIFIED),
    (e: any) => e.code === 'ILLEGAL_FUNDING_TRANSITION');
});

test('a queued funding request can reach every real verification outcome', () => {
  for (const to of [FUNDING.VERIFIED, FUNDING.PARTIAL, FUNDING.OVERPAID, FUNDING.REJECTED, FUNDING.NEEDS_INFORMATION, FUNDING.CANCELLED]) {
    assert.equal(canTransitionFunding(FUNDING.PENDING_VERIFICATION, to), true, `PENDING_VERIFICATION -> ${to}`);
  }
});

test('verified funding can only leave through a refund', () => {
  assert.equal(canTransitionFunding(FUNDING.VERIFIED, FUNDING.REFUND_PENDING), true);
  for (const to of [FUNDING.CANCELLED, FUNDING.REJECTED, FUNDING.PENDING_VERIFICATION, FUNDING.FUNDING_REQUIRED]) {
    assert.equal(canTransitionFunding(FUNDING.VERIFIED, to), false, `VERIFIED must not reach ${to}`);
  }
});

test('a part payment can be topped up to VERIFIED', () => {
  assert.equal(canTransitionFunding(FUNDING.PARTIAL, FUNDING.VERIFIED), true);
  assert.equal(canTransitionFunding(FUNDING.PARTIAL, FUNDING.PENDING_VERIFICATION), true);
});

test('replaying the same state is allowed, an unknown one is not', () => {
  assert.equal(canTransitionFunding(FUNDING.VERIFIED, FUNDING.VERIFIED), true);
  assert.equal(canTransitionFunding(FUNDING.VERIFIED, 'TELEPORTED'), false);
  assert.equal(canTransitionFunding(null, FUNDING.FUNDING_REQUIRED), true);
  assert.equal(canTransitionFunding(null, FUNDING.VERIFIED), false);
});

test('isFunded is true only where money has actually covered the prize', () => {
  assert.equal(isFunded(FUNDING.VERIFIED), true);
  assert.equal(isFunded(FUNDING.OVERPAID), true);
  assert.equal(isFunded(FUNDING.PARTIAL), false);
  assert.equal(isFunded(FUNDING.TRANSFER_REPORTED), false);
  assert.equal(isFunded(FUNDING.PENDING_VERIFICATION), false);
});

test('a withdrawal cannot jump from REQUESTED straight to PAID', () => {
  assert.equal(canTransitionWithdrawal(WITHDRAWAL.REQUESTED, WITHDRAWAL.PAID), false);
  assert.equal(canTransitionWithdrawal(WITHDRAWAL.APPROVED, WITHDRAWAL.PAID), false);
  assert.throws(() => assertWithdrawalTransition(WITHDRAWAL.REQUESTED, WITHDRAWAL.PAID),
    (e: any) => e.code === 'ILLEGAL_WITHDRAWAL_TRANSITION');
});

test('the approved -> transfer sent -> paid path is the only way to PAID', () => {
  assert.equal(canTransitionWithdrawal(WITHDRAWAL.REQUESTED, WITHDRAWAL.APPROVED), true);
  assert.equal(canTransitionWithdrawal(WITHDRAWAL.APPROVED, WITHDRAWAL.TRANSFER_SENT), true);
  assert.equal(canTransitionWithdrawal(WITHDRAWAL.TRANSFER_SENT, WITHDRAWAL.PAID), true);
});

test('a paid withdrawal is terminal except for a reversal', () => {
  assert.equal(canTransitionWithdrawal(WITHDRAWAL.PAID, WITHDRAWAL.REVERSED), true);
  for (const to of [WITHDRAWAL.CANCELLED, WITHDRAWAL.FAILED, WITHDRAWAL.APPROVED, WITHDRAWAL.REQUESTED]) {
    assert.equal(canTransitionWithdrawal(WITHDRAWAL.PAID, to), false, `PAID must not reach ${to}`);
  }
});

test('a failed transfer returns to the queue rather than dropping the reservation', () => {
  assert.equal(canTransitionWithdrawal(WITHDRAWAL.PROCESSING, WITHDRAWAL.FAILED), true);
  assert.equal(canTransitionWithdrawal(WITHDRAWAL.TRANSFER_SENT, WITHDRAWAL.FAILED), true);
  assert.equal(canTransitionWithdrawal(WITHDRAWAL.FAILED, WITHDRAWAL.APPROVED), true);
  assert.ok(WITHDRAWAL_RESERVING.includes(WITHDRAWAL.FAILED), 'a failed transfer still holds the reservation');
});

test('reserving states hold money and terminal states do not', () => {
  for (const s of [WITHDRAWAL.REQUESTED, WITHDRAWAL.UNDER_REVIEW, WITHDRAWAL.APPROVED, WITHDRAWAL.PROCESSING, WITHDRAWAL.TRANSFER_SENT, WITHDRAWAL.ON_HOLD]) {
    assert.ok(WITHDRAWAL_RESERVING.includes(s), `${s} should hold a reservation`);
  }
  for (const s of [WITHDRAWAL.PAID, WITHDRAWAL.CANCELLED, WITHDRAWAL.REVERSED]) {
    assert.equal(WITHDRAWAL_RESERVING.includes(s), false, `${s} must not hold a reservation`);
  }
});

test('a payout cannot become eligible without going through the eligibility gate', () => {
  assert.equal(canTransitionPayout(PAYOUT.PAYOUT_NOT_ELIGIBLE, PAYOUT.PAYOUT_PAID), false);
  assert.equal(canTransitionPayout(PAYOUT.PAYOUT_NOT_ELIGIBLE, PAYOUT.PAYOUT_ELIGIBLE), true);
  assert.equal(canTransitionPayout(PAYOUT.PAYOUT_PAID, PAYOUT.PAYOUT_REQUESTED), false);
});

test('a refund cannot be marked refunded without being approved and processed', () => {
  assert.equal(canTransitionRefund(REFUND.REFUND_REQUESTED, REFUND.REFUNDED), false);
  assert.equal(canTransitionRefund(REFUND.REFUND_APPROVED, REFUND.REFUND_PROCESSING), true);
  assert.equal(canTransitionRefund(REFUND.REFUND_PROCESSING, REFUND.REFUNDED), true);
});

test('every reachable status has user-facing copy, so no unlabelled state can reach a person', () => {
  for (const s of Object.values(FUNDING)) assert.ok(FUNDING_COPY[s as string], `FUNDING_COPY missing ${s}`);
  for (const s of Object.values(WITHDRAWAL)) assert.ok(WITHDRAWAL_COPY[s as string], `WITHDRAWAL_COPY missing ${s}`);
  for (const s of Object.values(PAYOUT)) assert.ok(PAYOUT_COPY[s as string], `PAYOUT_COPY missing ${s}`);
});

test('the queue and awaiting-money sets are disjoint from settled states', () => {
  for (const s of FUNDING_IN_QUEUE) assert.equal(FUNDING_MONEY_RECEIVED.includes(s) && s !== FUNDING.PARTIAL, false);
  assert.ok(FUNDING_AWAITING_MONEY.includes(FUNDING.REJECTED), 'a rejected claim can be re-reported');
  assert.equal(FUNDING_AWAITING_MONEY.includes(FUNDING.VERIFIED), false);
});

// ═══ Reconciliation and amounts ═════════════════════════════════════════════

test('reconciliation classifies every pair of numbers into exactly one state', () => {
  assert.equal(classifyReconciliation(1000, 1000), RECON.MATCHED);
  assert.equal(classifyReconciliation(1000, 900), RECON.PARTIAL);
  assert.equal(classifyReconciliation(1000, 1100), RECON.OVERPAID);
  assert.equal(classifyReconciliation(1000, 0), RECON.MISMATCH);
  assert.equal(classifyReconciliation(1000, NaN), RECON.UNRESOLVED);
});

test('reconciliation has no tolerance band — one paisa short is short', () => {
  assert.equal(classifyReconciliation(5590000, 5589999), RECON.PARTIAL);
  assert.equal(classifyReconciliation(5590000, 5590001), RECON.OVERPAID);
});

test('minor units round-trip without floating point drift', () => {
  for (const major of [50000.05, 33333.33, 0.01, 1999.99, 123456.78]) {
    assert.equal(toMajor(toMinor(major, INR), INR), major, `${major} did not round-trip`);
  }
  assert.equal(toMinor(50000, INR), 5000000);
  assert.equal(feeFromBps(5000000, 1000), 500000, '10% of ₹50,000');
});

test('a balance moves the right way for its account class', () => {
  // An asset grows with debits.
  assert.equal(normalSide(ACCOUNT_CLASS.BANK_SETTLEMENT), 'DEBIT');
  assert.equal(applyToBalance(ACCOUNT_CLASS.BANK_SETTLEMENT, 0, 'DEBIT', 100), 100);
  assert.equal(applyToBalance(ACCOUNT_CLASS.BANK_SETTLEMENT, 100, 'CREDIT', 40), 60);
  // What RazeKit owes grows with credits.
  assert.equal(normalSide(ACCOUNT_CLASS.PAYOUT_LIABILITY), 'CREDIT');
  assert.equal(applyToBalance(ACCOUNT_CLASS.PAYOUT_LIABILITY, 0, 'CREDIT', 100), 100);
  assert.equal(applyToBalance(ACCOUNT_CLASS.PAYOUT_LIABILITY, 100, 'DEBIT', 40), 60);
});

test('an account code is deterministic and scoped to its subject', () => {
  assert.equal(accountCode(ACCOUNT_CLASS.CLIENT_FUNDS, INR, 'U1'), accountCode(ACCOUNT_CLASS.CLIENT_FUNDS, INR, 'U1'));
  assert.notEqual(accountCode(ACCOUNT_CLASS.CLIENT_FUNDS, INR, 'U1'), accountCode(ACCOUNT_CLASS.CLIENT_FUNDS, INR, 'U2'));
  assert.equal(accountCode(ACCOUNT_CLASS.BANK_SETTLEMENT, INR), 'BANK_SETTLEMENT:INR');
  assert.throws(() => accountCode(ACCOUNT_CLASS.CLIENT_FUNDS, INR, undefined), /ACCOUNT_SUBJECT_REQUIRED/);
  assert.throws(() => accountCode('NOT_A_CLASS', INR), /UNKNOWN_ACCOUNT_CLASS/);
});

test('two subjects never share one book', async () => {
  const svc = fakeSvc();
  await recordFundingVerified(svc, { funding: funding({ brand_id: 'CLIENT_A' }), actorId: 'A1', bankReference: 'U1' });
  await recordFundingVerified(svc, { funding: funding({ id: 'F2', brand_id: 'CLIENT_B' }), actorId: 'A1', bankReference: 'U2' });
  assert.equal(await bal(svc, ACCOUNT_CLASS.CLIENT_FUNDS, 'CLIENT_A'), 5000000);
  assert.equal(await bal(svc, ACCOUNT_CLASS.CLIENT_FUNDS, 'CLIENT_B'), 5000000);
});

// ═══ Balance definitions ════════════════════════════════════════════════════

test('a creator balance reports available, pending and total consistently', async () => {
  const svc = fakeSvc();
  await createPayoutLiability(svc, {
    payout: { id: 'P1', reference: 'R', creator_id: 'CREATOR1', currency: INR, amount_minor: 5000000 },
    contestId: 'C1', brandId: 'CLIENT1',
  });

  let b = await razekitBalance(svc, { userId: 'CREATOR1', currency: INR, role: 'creator' });
  assert.equal(b.total_minor, 5000000);
  assert.equal(b.available_minor, 5000000);
  assert.equal(b.withdrawable_minor, 5000000);
  assert.equal(b.pending_minor, 0);
  assert.equal(b.can_withdraw, true);

  await reserveWithdrawal(svc, {
    withdrawal: { id: 'W1', reference: 'R', user_id: 'CREATOR1', currency: INR, amount_minor: 5000000 },
    actorId: 'CREATOR1',
  });
  b = await razekitBalance(svc, { userId: 'CREATOR1', currency: INR, role: 'creator' });
  assert.equal(b.total_minor, 5000000, 'requesting does not change the total');
  assert.equal(b.available_minor, 0);
  assert.equal(b.pending_minor, 5000000);
  assert.equal(b.withdrawable_minor, 0);
  assert.equal(b.paid_out_minor, 0);

  await recordWithdrawalPaid(svc, {
    withdrawal: { id: 'W1', reference: 'R', user_id: 'CREATOR1', currency: INR, amount_minor: 5000000 },
    actorId: 'A1',
  });
  b = await razekitBalance(svc, { userId: 'CREATOR1', currency: INR, role: 'creator' });
  assert.equal(b.total_minor, 0);
  assert.equal(b.pending_minor, 0);
  assert.equal(b.paid_out_minor, 5000000);
});

test('a balance below the minimum cannot be withdrawn', async () => {
  const svc = fakeSvc();
  await createPayoutLiability(svc, {
    payout: { id: 'P1', reference: 'R', creator_id: 'C9', currency: INR, amount_minor: MIN_WITHDRAWAL_MINOR - 1 },
    contestId: 'C1', brandId: 'B1',
  });
  const b = await razekitBalance(svc, { userId: 'C9', currency: INR, role: 'creator' });
  assert.equal(b.can_withdraw, false);
});

test('a client cannot withdraw — client money leaves through a refund', async () => {
  const svc = fakeSvc();
  await recordFundingVerified(svc, { funding: funding(), actorId: 'A1', bankReference: 'U1' });
  const b = await razekitBalance(svc, { userId: 'CLIENT1', currency: INR, role: 'client' });
  assert.equal(b.available_minor, 5000000);
  assert.equal(b.withdrawable_minor, 0);
  assert.equal(b.can_withdraw, false);
});

test('every balance figure carries a definition, so no number is unexplained', async () => {
  const svc = fakeSvc();
  for (const role of ['creator', 'client']) {
    const b = await razekitBalance(svc, { userId: 'U1', currency: INR, role });
    for (const k of ['total', 'available', 'reserved', 'pending', 'withdrawable', 'paid_out']) {
      assert.equal(typeof b.definitions[k], 'string', `${role}.${k} needs a definition`);
      assert.ok(b.definitions[k].length > 10);
    }
  }
});

// ═══ Masking and configuration ══════════════════════════════════════════════

test('a masked account number never reveals the full number', () => {
  const raw = '12345678901234';
  const masked = maskAccountNumber(raw);
  assert.equal(masked, 'XXXXXX01234');
  assert.equal(masked.includes(raw), false);
  assert.equal(/\d/.test(masked), true);
  // At most the last five digits survive.
  const digits = masked.replace(/\D/g, '');
  assert.ok(digits.length <= 5, 'no more than five digits are exposed');
  assert.ok(raw.endsWith(digits));
  assert.equal(last4(raw), '1234');
  assert.equal(maskAccountNumber(''), '');
});

test('IFSC and UPI masks never return the original in full', () => {
  assert.notEqual(maskIfsc('ABCD0123456'), 'ABCD0123456');
  assert.ok(maskIfsc('ABCD0123456').includes('*'));
  const upi = 'example@upi';
  assert.notEqual(maskUpi(upi), upi);
  assert.ok(maskUpi(upi).includes('*'));
  assert.ok(maskUpi(upi).endsWith('@upi'), 'the provider stays readable');
});

test('account, IFSC and UPI validation accepts real values and rejects junk', () => {
  assert.equal(isValidAccountNumber('12345678901234'), true);
  assert.equal(isValidAccountNumber('12345'), false);
  assert.equal(isValidAccountNumber('abcdefghij'), false);

  assert.equal(isValidIfsc('ABCD0123456'), true);
  assert.equal(isValidIfsc('HDFC0001234'), true);
  assert.equal(isValidIfsc('FDRL1001387'), false, 'the fifth character must be 0');
  assert.equal(isValidIfsc('FDR0001387'), false);

  assert.equal(isValidUpiId('example@upi'), true);
  assert.equal(isValidUpiId('name.surname@okhdfc'), true);
  assert.equal(isValidUpiId('nodomain'), false);
  assert.equal(isValidUpiId('@bank'), false);
});

const settings = (o: any = {}) => ({
  version: 3, payment_mode: 'MANUAL_BETA',
  bank_transfer_enabled: true, upi_enabled: true, upi_qr_enabled: true,
  bank_account_name: 'Vigneswaran A', bank_account_number: '12345678901234',
  bank_ifsc: 'ABCD0123456', bank_name: 'Federal Bank', bank_branch: '2336',
  upi_id: 'someone@ptsbi', payment_instructions: 'Use the reference.',
  support_phone: '0000000000', support_email: 'support@example.com', verification_hours: 24,
  created_date: 'x', ...o,
});
const qr = { version: 2, file_uri: 'local:qr.png', uploaded_at: 'x' };

test('a method enabled but not configured is reported as unavailable', () => {
  const m = enabledMethods(settings({ upi_id: '' }), qr);
  assert.equal(m[PAYMENT_METHOD.UPI], false, 'UPI is on but has no ID behind it');
  assert.equal(m[PAYMENT_METHOD.BANK_TRANSFER], true);
  const noQr = enabledMethods(settings(), null);
  assert.equal(noQr[PAYMENT_METHOD.UPI_QR], false);
});

test('instructions contain ONLY enabled methods — a disabled method never leaks its details', () => {
  const out = instructionsFor(settings({ upi_enabled: false, upi_qr_enabled: false }), qr);
  const keys = out.methods.map((m: any) => m.key);
  assert.deepEqual(keys, [PAYMENT_METHOD.BANK_TRANSFER]);
  const blob = JSON.stringify(out);
  assert.equal(blob.includes('someone@ptsbi'), false, 'the disabled UPI ID must not appear');

  const all = instructionsFor(settings(), qr);
  assert.equal(all.methods.length, 3);
  assert.equal(all.methods.find((m: any) => m.key === PAYMENT_METHOD.BANK_TRANSFER).fields.account_number, '12345678901234');
});

test('masked settings never contain the raw account number, IFSC or UPI id', () => {
  const blob = JSON.stringify(maskedSettings(settings(), qr));
  assert.equal(blob.includes('12345678901234'), false);
  assert.equal(blob.includes('ABCD0123456'), false);
  assert.equal(blob.includes('someone@ptsbi'), false);
  assert.ok(blob.includes('XXXXXX01234'), 'the masked form is present');
});

test('a settings change is audited by which field moved, never by its value', () => {
  const actions = auditActionsFor([{ field: 'bank_account_number', sensitive: true }, { field: 'upi_id', sensitive: true }]);
  assert.ok(actions.includes('BANK_DETAILS_UPDATED'));
  assert.ok(actions.includes('UPI_ID_UPDATED'));
  assert.ok(auditActionsFor([{ field: 'upi_qr_enabled', sensitive: false }]).includes('PAYMENT_METHOD_TOGGLED'));
});

test('the beta notice claims nothing RazeKit cannot deliver', () => {
  const n = betaNotice();
  const blob = [n.title, ...n.body, ...n.disclaimers].join(' ').toLowerCase();
  for (const forbidden of ['instant', 'guaranteed', 'escrow service is provided', 'regulated wallet is']) {
    assert.equal(blob.includes(forbidden), false, `the notice must not claim "${forbidden}"`);
  }
  assert.ok(blob.includes('not a bank'), 'it says plainly what RazeKit is not');
  assert.ok(n.disclaimers.length >= 3);
});

// ═══ Permissions ════════════════════════════════════════════════════════════

test('the permission catalogue has no duplicates despite the deprecated aliases', () => {
  assert.equal(new Set(ALL_FINANCE_PERMISSIONS).size, ALL_FINANCE_PERMISSIONS.length);
  assert.equal(FINANCE_PERMISSION.APPROVE_PAYOUT, FINANCE_PERMISSION.APPROVE_WITHDRAWAL);
  assert.equal(FINANCE_PERMISSION.RECORD_PAYOUT, FINANCE_PERMISSION.CONFIRM_PAYOUT);
});

test('seeing account numbers and moving money are separate permissions', () => {
  assert.notEqual(FINANCE_PERMISSION.VIEW_SENSITIVE, FINANCE_PERMISSION.CONFIRM_PAYOUT);
  assert.notEqual(FINANCE_PERMISSION.VERIFY_FUNDING, FINANCE_PERMISSION.APPROVE_WITHDRAWAL);
  assert.ok(ALL_FINANCE_PERMISSIONS.includes(FINANCE_PERMISSION.VIEW_SENSITIVE));
});

test('a platform admin implicitly holds every finance permission', async () => {
  const svc = fakeSvc();
  const held = await permissionsFor(svc, { id: 'A1', role: 'admin' });
  assert.deepEqual([...held].sort(), [...ALL_FINANCE_PERMISSIONS].sort());
});

test('a non-admin holds only what was granted, and a revoked grant is not held', async () => {
  const svc = fakeSvc();
  await svc.entities.AdminPermission.create({ user_id: 'U1', permission: FINANCE_PERMISSION.VIEW, active: true });
  await svc.entities.AdminPermission.create({ user_id: 'U1', permission: FINANCE_PERMISSION.VERIFY_FUNDING, active: true, revoked_at: 'yesterday' });

  const held = await permissionsFor(svc, { id: 'U1', role: 'user' });
  assert.deepEqual(held, [FINANCE_PERMISSION.VIEW]);
  assert.equal(await hasPermission(svc, { id: 'U1', role: 'user' }, FINANCE_PERMISSION.VERIFY_FUNDING), false);
  assert.equal(await hasPermission(svc, { id: 'U1', role: 'user' }, FINANCE_PERMISSION.CONFIRM_PAYOUT), false);
});

test('an anonymous caller holds no finance permission at all', async () => {
  const svc = fakeSvc();
  assert.deepEqual(await permissionsFor(svc, null), []);
  assert.equal(await hasPermission(svc, null, FINANCE_PERMISSION.VIEW), false);
});

test('a grant for one user does not leak to another', async () => {
  const svc = fakeSvc();
  await svc.entities.AdminPermission.create({ user_id: 'U1', permission: FINANCE_PERMISSION.REFUND, active: true });
  assert.deepEqual(await permissionsFor(svc, { id: 'U2', role: 'user' }), []);
});
