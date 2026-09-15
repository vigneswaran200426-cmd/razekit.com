// @ts-nocheck
// The posting engine. This is the only place in RazeKit that writes money.
//
// Three rules, enforced here rather than trusted to callers:
//
//   1. IMMUTABLE. A LedgerEntry is written once and never updated or deleted.
//      A mistake is corrected by posting a reversal, so the history of what was
//      believed at the time survives intact.
//
//   2. BALANCED. Debits must equal credits, to the minor unit, in every
//      transaction. An unbalanced posting is refused; it is never "fixed up".
//
//   3. IDEMPOTENT. A transaction carries an idempotency key. Replaying the same
//      operation returns the original transaction instead of duplicating money
//      — the single most important property when a human clicks "verify" twice.
//
// There is deliberately no `balance = balance + amount` anywhere. Balances are
// derived from entries; the column on LedgerAccount is a cache that
// replayBalance() can always rebuild and that the tests assert against.
import { makeRef } from '../money/core.js';
import { getOrCreateAccount, applyToBalance, ACCOUNT_CLASS } from './accounts.js';

export const DIRECTION = { DEBIT: 'DEBIT', CREDIT: 'CREDIT' };

/** Semantic entry types (what happened), distinct from direction (which way). */
export const ENTRY_TYPE = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  RESERVATION: 'RESERVATION',
  RELEASE: 'RELEASE',
  REVERSAL: 'REVERSAL',
  REFUND: 'REFUND',
  PAYOUT_PENDING: 'PAYOUT_PENDING',
  PAYOUT_PAID: 'PAYOUT_PAID',
  WITHDRAWAL_RESERVED: 'WITHDRAWAL_RESERVED',
  ADJUSTMENT: 'ADJUSTMENT',
};

export const TXN_TYPE = {
  FUNDING_RECEIVED: 'FUNDING_RECEIVED',
  PRIZE_RESERVED: 'PRIZE_RESERVED',
  PRIZE_RELEASED: 'PRIZE_RELEASED',
  PAYOUT_LIABILITY_CREATED: 'PAYOUT_LIABILITY_CREATED',
  PAYOUT_PAID: 'PAYOUT_PAID',
  WITHDRAWAL_RESERVED: 'WITHDRAWAL_RESERVED',
  WITHDRAWAL_RELEASED: 'WITHDRAWAL_RELEASED',
  WITHDRAWAL_PAID: 'WITHDRAWAL_PAID',
  REFUND_APPROVED: 'REFUND_APPROVED',
  REFUND_PAID: 'REFUND_PAID',
  REVERSAL: 'REVERSAL',
  ADJUSTMENT: 'ADJUSTMENT',
};

export class LedgerError extends Error {
  constructor(code, message, status = 400) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

function assertAmount(amountMinor) {
  const n = Math.round(Number(amountMinor));
  if (!Number.isFinite(n) || n <= 0) {
    throw new LedgerError('LEDGER_INVALID_AMOUNT', `Amount must be a positive integer of minor units, got ${amountMinor}.`);
  }
  if (n > Number.MAX_SAFE_INTEGER / 1000) {
    throw new LedgerError('LEDGER_AMOUNT_TOO_LARGE', 'Amount exceeds the safe integer range.');
  }
  return n;
}

/**
 * Post one balanced transaction.
 *
 * `lines` are `{ accountClass, subjectId, direction, amountMinor, entryType,
 * description }`. Accounts are resolved (and created once) from the class and
 * subject, so a caller cannot post into an account that does not belong to the
 * subject it names.
 */
export async function postTransaction(svc, {
  txnType,
  currency,
  lines,
  idempotencyKey,
  contestId = null,
  fundingId = null,
  payoutId = null,
  withdrawalId = null,
  brandId = null,
  creatorId = null,
  actorId = null,
  actorRole = null,
  description = '',
  reversesTxnId = null,
  metadata = null,
}) {
  if (!txnType) throw new LedgerError('LEDGER_TXN_TYPE_REQUIRED', 'A transaction type is required.');
  if (!currency) throw new LedgerError('LEDGER_CURRENCY_REQUIRED', 'A currency is required.');
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new LedgerError('LEDGER_UNBALANCED', 'A transaction needs at least one debit and one credit.');
  }

  // ── Idempotency ──────────────────────────────────────────────────────────
  // Checked before anything is written. A retried verification, a double click
  // or a replayed job returns the original transaction untouched.
  if (idempotencyKey) {
    const existing = await svc.entities.LedgerTransaction
      .filter({ idempotency_key: idempotencyKey }, '-created_date', 1).catch(() => []);
    if (existing.length) {
      const entries = await svc.entities.LedgerEntry
        .filter({ transaction_id: existing[0].id }, 'sequence', 100).catch(() => []);
      return { transaction: existing[0], entries, replayed: true };
    }
  }

  // ── Balance check ────────────────────────────────────────────────────────
  let debits = 0;
  let credits = 0;
  for (const l of lines) {
    const amount = assertAmount(l.amountMinor);
    if (l.direction === DIRECTION.DEBIT) debits += amount;
    else if (l.direction === DIRECTION.CREDIT) credits += amount;
    else throw new LedgerError('LEDGER_INVALID_DIRECTION', `Direction must be DEBIT or CREDIT, got ${l.direction}.`);
  }
  if (debits !== credits) {
    throw new LedgerError(
      'LEDGER_UNBALANCED',
      `Debits (${debits}) must equal credits (${credits}). The transaction was not posted.`
    );
  }

  const postedAt = new Date().toISOString();
  const reference = makeRef('RK-LGR');

  const txn = await svc.entities.LedgerTransaction.create({
    reference,
    txn_type: txnType,
    status: 'POSTED',
    currency,
    amount_minor: debits, // the transaction's magnitude, one side of the pair
    contest_id: contestId,
    funding_id: fundingId,
    payout_id: payoutId,
    withdrawal_id: withdrawalId,
    brand_id: brandId,
    creator_id: creatorId,
    idempotency_key: idempotencyKey || null,
    description,
    actor_id: actorId,
    actor_role: actorRole,
    posted_at: postedAt,
    reverses_txn_id: reversesTxnId,
    metadata: metadata ? JSON.stringify(metadata) : null,
    entry_count: lines.length,
  });

  const entries = [];
  let sequence = 0;
  for (const l of lines) {
    const amount = assertAmount(l.amountMinor);
    const account = await getOrCreateAccount(svc, {
      accountClass: l.accountClass,
      currency,
      subjectId: l.subjectId,
      contestId,
    });
    // The running balance is computed from the account's own prior entries, so
    // it stays correct even if the cached column were ever wrong.
    const prior = await svc.entities.LedgerEntry
      .filter({ account_id: account.id }, '-created_date', 1).catch(() => []);
    const priorBalance = prior.length ? Number(prior[0].balance_after_minor || 0) : 0;
    const balanceAfter = applyToBalance(account.account_class, priorBalance, l.direction, amount);

    const entry = await svc.entities.LedgerEntry.create({
      transaction_id: txn.id,
      transaction_reference: reference,
      account_id: account.id,
      account_code: account.account_code,
      account_class: account.account_class,
      entry_type: l.entryType || (l.direction === DIRECTION.DEBIT ? ENTRY_TYPE.DEBIT : ENTRY_TYPE.CREDIT),
      direction: l.direction,
      amount_minor: amount,
      currency,
      balance_after_minor: balanceAfter,
      contest_id: contestId,
      funding_id: fundingId,
      payout_id: payoutId,
      withdrawal_id: withdrawalId,
      owner_type: account.owner_type,
      owner_id: account.owner_id,
      sequence: sequence++,
      posted_at: postedAt,
      description: l.description || description || '',
    });
    entries.push(entry);

    // Cache only. replayBalance() is the authority and can rebuild this at any
    // time; nothing reads it to make a decision about whether money exists.
    await svc.entities.LedgerAccount.update(account.id, {
      balance_minor: balanceAfter,
      last_txn_id: txn.id,
      last_posted_at: postedAt,
    }).catch(() => null);
  }

  return { transaction: txn, entries, replayed: false };
}

/**
 * Reverse a transaction by posting its mirror image. The original is never
 * touched: both rows stay, linked, so an auditor can see the mistake and the
 * correction rather than only the tidied-up result.
 */
export async function reverseTransaction(svc, { transactionId, reason, actorId, actorRole }) {
  const original = await svc.entities.LedgerTransaction.get(transactionId).catch(() => null);
  if (!original) throw new LedgerError('LEDGER_TXN_NOT_FOUND', 'Transaction not found.', 404);
  if (original.reversed_by_txn_id) {
    const existing = await svc.entities.LedgerTransaction.get(original.reversed_by_txn_id).catch(() => null);
    if (existing) return { transaction: existing, replayed: true };
  }
  if (original.txn_type === TXN_TYPE.REVERSAL) {
    throw new LedgerError('LEDGER_CANNOT_REVERSE_REVERSAL', 'A reversal cannot itself be reversed.', 409);
  }

  const entries = await svc.entities.LedgerEntry
    .filter({ transaction_id: original.id }, 'sequence', 100).catch(() => []);
  if (!entries.length) throw new LedgerError('LEDGER_TXN_EMPTY', 'The transaction has no entries to reverse.', 409);

  const lines = entries.map((e) => ({
    accountClass: e.account_class,
    subjectId: e.owner_id || e.contest_id,
    direction: e.direction === DIRECTION.DEBIT ? DIRECTION.CREDIT : DIRECTION.DEBIT,
    amountMinor: Number(e.amount_minor || 0),
    entryType: ENTRY_TYPE.REVERSAL,
    description: `Reversal of ${original.reference}`,
  }));

  const posted = await postTransaction(svc, {
    txnType: TXN_TYPE.REVERSAL,
    currency: original.currency,
    lines,
    idempotencyKey: `reversal:${original.id}`,
    contestId: original.contest_id,
    fundingId: original.funding_id,
    payoutId: original.payout_id,
    brandId: original.brand_id,
    creatorId: original.creator_id,
    actorId,
    actorRole,
    description: reason || `Reversal of ${original.reference}`,
    reversesTxnId: original.id,
  });

  // The pointer is bookkeeping metadata, not a change to what was recorded:
  // amounts, directions and entries of the original are untouched.
  await svc.entities.LedgerTransaction.update(original.id, {
    reversed_by_txn_id: posted.transaction.id,
    status: 'REVERSED',
  }).catch(() => null);

  return posted;
}

export { ACCOUNT_CLASS };
