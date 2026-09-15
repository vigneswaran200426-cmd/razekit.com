// @ts-nocheck
// Domain money events.
//
// Handlers never assemble ledger lines themselves — they call one of these.
// Keeping the double-entry shape of each business event in a single place is
// what makes "client funds", "platform fee", "prize committed to this contest"
// and "owed to this creator" stay four different things instead of drifting
// into one balance that nobody can explain.
//
//   funding verified   BANK        ← client's money arrives, split three ways
//   prize reserved     CLIENT_FUNDS → CONTEST_PRIZE_COMMITMENT
//   winner finalised   CONTEST_PRIZE_COMMITMENT → PAYOUT_LIABILITY
//   payout paid        PAYOUT_LIABILITY → BANK
//   refund approved    CLIENT_FUNDS + fee + tax → REFUND_CLEARING
//   refund paid        REFUND_CLEARING → BANK
import { postTransaction, reverseTransaction, DIRECTION, ENTRY_TYPE, TXN_TYPE } from './post.js';
import { ACCOUNT_CLASS, balanceOf } from './accounts.js';

const D = DIRECTION.DEBIT;
const C = DIRECTION.CREDIT;

/**
 * A verified bank transfer. Called ONLY after a human matched it against the
 * bank statement — never from a brand's claim.
 *
 * The client's payment is split at the moment it lands: the prize stays the
 * client's money (CLIENT_FUNDS) until it is committed to a contest, while the
 * fee and tax are RazeKit's from the start.
 */
export async function recordFundingVerified(svc, {
  funding, actorId, actorRole = 'admin', amountMinor, bankReference, bookFees = true,
}) {
  const total = Math.round(Number(amountMinor ?? funding.total_amount_minor));
  // Fees and tax are charged ONCE per funding request, on the receipt that
  // first covers them. A top-up after a part payment is a second receipt
  // against the same charges — deducting them again would silently bill the
  // client twice for the same contest.
  const fee = bookFees ? Math.round(Number(funding.platform_fee_minor || 0)) : 0;
  const tax = bookFees ? Math.round(Number(funding.tax_minor || 0)) : 0;
  // The client's share is whatever is left after RazeKit's own charges, derived
  // from the amount actually received so a short or over payment still balances.
  const clientShare = total - fee - tax;
  if (clientShare <= 0) {
    const err = new Error('FUNDING_BELOW_FEES');
    err.code = 'FUNDING_BELOW_FEES';
    err.status = 422;
    throw err;
  }

  const lines = [
    { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: D, amountMinor: total, entryType: ENTRY_TYPE.CREDIT, description: 'Bank transfer received' },
    { accountClass: ACCOUNT_CLASS.CLIENT_FUNDS, subjectId: funding.brand_id, direction: C, amountMinor: clientShare, entryType: ENTRY_TYPE.CREDIT, description: 'Client funds held' },
  ];
  if (fee > 0) lines.push({ accountClass: ACCOUNT_CLASS.PLATFORM_FEE, direction: C, amountMinor: fee, entryType: ENTRY_TYPE.CREDIT, description: 'Platform fee' });
  if (tax > 0) lines.push({ accountClass: ACCOUNT_CLASS.TAX_PAYABLE, direction: C, amountMinor: tax, entryType: ENTRY_TYPE.CREDIT, description: 'Tax on platform charges' });

  return postTransaction(svc, {
    txnType: TXN_TYPE.FUNDING_RECEIVED,
    currency: funding.currency,
    lines,
    // Keyed on the BANK REFERENCE, not the funding request: one real transfer
    // credits the ledger exactly once, and a genuine top-up after a shortfall
    // is a different reference and so a legitimate second credit.
    idempotencyKey: `funding_credit:${funding.id}:${String(bankReference || 'primary').trim().toUpperCase()}`,
    contestId: funding.contest_id,
    fundingId: funding.id,
    brandId: funding.brand_id,
    actorId,
    actorRole,
    description: `Verified bank transfer for funding ${funding.reference}`,
  });
}

/**
 * Commit the prize to one contest. After this the money is earmarked: it is no
 * longer spendable on another contest, and the contest can go live.
 */
export async function reservePrize(svc, { funding, prizeMinor, actorId, actorRole = 'admin' }) {
  const amount = Math.round(Number(prizeMinor ?? funding.prize_amount_minor));
  return postTransaction(svc, {
    txnType: TXN_TYPE.PRIZE_RESERVED,
    currency: funding.currency,
    lines: [
      { accountClass: ACCOUNT_CLASS.CLIENT_FUNDS, subjectId: funding.brand_id, direction: D, amountMinor: amount, entryType: ENTRY_TYPE.RESERVATION, description: 'Prize committed to contest' },
      { accountClass: ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, subjectId: funding.contest_id, direction: C, amountMinor: amount, entryType: ENTRY_TYPE.RESERVATION, description: 'Prize held for this contest' },
    ],
    idempotencyKey: `prize_reserved:${funding.id}`,
    contestId: funding.contest_id,
    fundingId: funding.id,
    brandId: funding.brand_id,
    actorId,
    actorRole,
    description: `Prize reserved for contest ${funding.contest_id}`,
  });
}

/** Un-commit a prize (contest cancelled before a winner). Money returns to the client's pot. */
export async function releasePrize(svc, { funding, prizeMinor, actorId, actorRole = 'admin', reason }) {
  const amount = Math.round(Number(prizeMinor ?? funding.prize_amount_minor));
  return postTransaction(svc, {
    txnType: TXN_TYPE.PRIZE_RELEASED,
    currency: funding.currency,
    lines: [
      { accountClass: ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, subjectId: funding.contest_id, direction: D, amountMinor: amount, entryType: ENTRY_TYPE.RELEASE, description: 'Prize commitment released' },
      { accountClass: ACCOUNT_CLASS.CLIENT_FUNDS, subjectId: funding.brand_id, direction: C, amountMinor: amount, entryType: ENTRY_TYPE.RELEASE, description: 'Returned to client funds' },
    ],
    idempotencyKey: `prize_released:${funding.id}`,
    contestId: funding.contest_id,
    fundingId: funding.id,
    brandId: funding.brand_id,
    actorId,
    actorRole,
    description: reason || 'Prize commitment released',
  });
}

/**
 * A winner was finalised. The contest's committed prize becomes a debt RazeKit
 * owes to a named creator. No money has moved yet — that is `recordPayoutPaid`.
 */
export async function createPayoutLiability(svc, { payout, contestId, brandId, actorId, actorRole = 'system' }) {
  const amount = Math.round(Number(payout.amount_minor));
  return postTransaction(svc, {
    txnType: TXN_TYPE.PAYOUT_LIABILITY_CREATED,
    currency: payout.currency,
    lines: [
      { accountClass: ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, subjectId: contestId, direction: D, amountMinor: amount, entryType: ENTRY_TYPE.RELEASE, description: 'Prize awarded to winner' },
      { accountClass: ACCOUNT_CLASS.PAYOUT_LIABILITY, subjectId: payout.creator_id, direction: C, amountMinor: amount, entryType: ENTRY_TYPE.PAYOUT_PENDING, description: 'Owed to winning creator' },
    ],
    idempotencyKey: `payout_liability:${payout.id}`,
    contestId,
    payoutId: payout.id,
    brandId,
    creatorId: payout.creator_id,
    actorId,
    actorRole,
    description: `Payout liability for ${payout.reference}`,
  });
}

/** The bank transfer to the creator was actually made, and a human recorded its reference. */
export async function recordPayoutPaid(svc, { payout, actorId, actorRole = 'admin' }) {
  const amount = Math.round(Number(payout.amount_minor));
  return postTransaction(svc, {
    txnType: TXN_TYPE.PAYOUT_PAID,
    currency: payout.currency,
    lines: [
      { accountClass: ACCOUNT_CLASS.PAYOUT_LIABILITY, subjectId: payout.creator_id, direction: D, amountMinor: amount, entryType: ENTRY_TYPE.PAYOUT_PAID, description: 'Payout settled' },
      { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: C, amountMinor: amount, entryType: ENTRY_TYPE.PAYOUT_PAID, description: 'Bank transfer to creator' },
    ],
    idempotencyKey: `payout_paid:${payout.id}`,
    contestId: payout.contest_id,
    payoutId: payout.id,
    creatorId: payout.creator_id,
    actorId,
    actorRole,
    description: `Payout paid ${payout.reference}`,
  });
}

/** A refund was approved. The money is moved out of the client's pot into a clearing account. */
export async function approveRefund(svc, { funding, amountMinor, refundFees, actorId, actorRole = 'admin' }) {
  const fee = refundFees ? Math.round(Number(funding.platform_fee_minor || 0)) : 0;
  const tax = refundFees ? Math.round(Number(funding.tax_minor || 0)) : 0;
  const clientPart = Math.round(Number(amountMinor));
  const total = clientPart + fee + tax;

  const lines = [
    { accountClass: ACCOUNT_CLASS.CLIENT_FUNDS, subjectId: funding.brand_id, direction: D, amountMinor: clientPart, entryType: ENTRY_TYPE.REFUND, description: 'Refund approved' },
  ];
  if (fee > 0) lines.push({ accountClass: ACCOUNT_CLASS.PLATFORM_FEE, direction: D, amountMinor: fee, entryType: ENTRY_TYPE.REFUND, description: 'Platform fee refunded' });
  if (tax > 0) lines.push({ accountClass: ACCOUNT_CLASS.TAX_PAYABLE, direction: D, amountMinor: tax, entryType: ENTRY_TYPE.REFUND, description: 'Tax refunded' });
  lines.push({ accountClass: ACCOUNT_CLASS.REFUND_CLEARING, direction: C, amountMinor: total, entryType: ENTRY_TYPE.REFUND, description: 'Refund pending transfer' });

  return postTransaction(svc, {
    txnType: TXN_TYPE.REFUND_APPROVED,
    currency: funding.currency,
    lines,
    idempotencyKey: `refund_approved:${funding.id}`,
    contestId: funding.contest_id,
    fundingId: funding.id,
    brandId: funding.brand_id,
    actorId,
    actorRole,
    description: `Refund approved for ${funding.reference}`,
  });
}

/** The refund transfer was made and recorded. */
export async function recordRefundPaid(svc, { funding, amountMinor, actorId, actorRole = 'admin' }) {
  const amount = Math.round(Number(amountMinor));
  return postTransaction(svc, {
    txnType: TXN_TYPE.REFUND_PAID,
    currency: funding.currency,
    lines: [
      { accountClass: ACCOUNT_CLASS.REFUND_CLEARING, direction: D, amountMinor: amount, entryType: ENTRY_TYPE.REFUND, description: 'Refund settled' },
      { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: C, amountMinor: amount, entryType: ENTRY_TYPE.REFUND, description: 'Bank transfer to client' },
    ],
    idempotencyKey: `refund_paid:${funding.id}`,
    contestId: funding.contest_id,
    fundingId: funding.id,
    brandId: funding.brand_id,
    actorId,
    actorRole,
    description: `Refund paid for ${funding.reference}`,
  });
}

/**
 * A manual correction. Requires an explicit reason and is attributed to the
 * admin who made it — an adjustment with no explanation is worse than no
 * adjustment at all.
 */
export async function postAdjustment(svc, { currency, lines, reason, actorId, actorRole = 'admin', contestId, idempotencyKey }) {
  if (!reason || String(reason).trim().length < 5) {
    const err = new Error('ADJUSTMENT_REASON_REQUIRED');
    err.code = 'ADJUSTMENT_REASON_REQUIRED';
    err.status = 400;
    throw err;
  }
  return postTransaction(svc, {
    txnType: TXN_TYPE.ADJUSTMENT,
    currency,
    lines: lines.map((l) => ({ ...l, entryType: ENTRY_TYPE.ADJUSTMENT })),
    idempotencyKey,
    contestId,
    actorId,
    actorRole,
    description: reason,
  });
}

// ── Withdrawals ─────────────────────────────────────────────────────────────

/**
 * A creator asked to withdraw. This does NOT debit them.
 *
 * The amount moves from their available balance into a WITHDRAWAL_PENDING
 * reservation, so the same rupee can never show as both "available to withdraw"
 * and "already paid". No money has left RazeKit and the creator is not out of
 * pocket if the request is later cancelled.
 */
export async function reserveWithdrawal(svc, { withdrawal, actorId, actorRole = 'creator' }) {
  const amount = Math.round(Number(withdrawal.amount_minor));
  return postTransaction(svc, {
    txnType: TXN_TYPE.WITHDRAWAL_RESERVED,
    currency: withdrawal.currency,
    lines: [
      { accountClass: ACCOUNT_CLASS.PAYOUT_LIABILITY, subjectId: withdrawal.user_id, direction: D, amountMinor: amount, entryType: ENTRY_TYPE.WITHDRAWAL_RESERVED, description: 'Reserved for withdrawal' },
      { accountClass: ACCOUNT_CLASS.WITHDRAWAL_PENDING, subjectId: withdrawal.user_id, direction: C, amountMinor: amount, entryType: ENTRY_TYPE.WITHDRAWAL_RESERVED, description: 'Withdrawal in progress' },
    ],
    idempotencyKey: `withdrawal_reserved:${withdrawal.id}`,
    withdrawalId: withdrawal.id,
    creatorId: withdrawal.user_id,
    actorId,
    actorRole,
    description: `Withdrawal ${withdrawal.reference} reserved`,
  });
}

/** The request was cancelled, rejected or failed: the reservation goes back to available. */
export async function releaseWithdrawal(svc, { withdrawal, actorId, actorRole = 'admin', reason }) {
  const amount = Math.round(Number(withdrawal.amount_minor));
  return postTransaction(svc, {
    txnType: TXN_TYPE.WITHDRAWAL_RELEASED,
    currency: withdrawal.currency,
    lines: [
      { accountClass: ACCOUNT_CLASS.WITHDRAWAL_PENDING, subjectId: withdrawal.user_id, direction: D, amountMinor: amount, entryType: ENTRY_TYPE.RELEASE, description: 'Withdrawal reservation released' },
      { accountClass: ACCOUNT_CLASS.PAYOUT_LIABILITY, subjectId: withdrawal.user_id, direction: C, amountMinor: amount, entryType: ENTRY_TYPE.RELEASE, description: 'Returned to available balance' },
    ],
    idempotencyKey: `withdrawal_released:${withdrawal.id}`,
    withdrawalId: withdrawal.id,
    creatorId: withdrawal.user_id,
    actorId,
    actorRole,
    description: reason || `Withdrawal ${withdrawal.reference} released`,
  });
}

/**
 * A person made the bank transfer and confirmed it. THIS is the debit — the
 * only point at which money actually leaves RazeKit's books, and it happens
 * after the real-world transfer, never before it.
 */
export async function recordWithdrawalPaid(svc, { withdrawal, actorId, actorRole = 'admin' }) {
  const amount = Math.round(Number(withdrawal.amount_minor));
  return postTransaction(svc, {
    txnType: TXN_TYPE.WITHDRAWAL_PAID,
    currency: withdrawal.currency,
    lines: [
      { accountClass: ACCOUNT_CLASS.WITHDRAWAL_PENDING, subjectId: withdrawal.user_id, direction: D, amountMinor: amount, entryType: ENTRY_TYPE.PAYOUT_PAID, description: 'Withdrawal settled' },
      { accountClass: ACCOUNT_CLASS.BANK_SETTLEMENT, direction: C, amountMinor: amount, entryType: ENTRY_TYPE.PAYOUT_PAID, description: 'Bank transfer to creator' },
    ],
    idempotencyKey: `withdrawal_paid:${withdrawal.id}`,
    withdrawalId: withdrawal.id,
    creatorId: withdrawal.user_id,
    actorId,
    actorRole,
    description: `Withdrawal ${withdrawal.reference} paid`,
  });
}

// ── Read models ─────────────────────────────────────────────────────────────

export { reverseTransaction, ACCOUNT_CLASS, balanceOf, TXN_TYPE, ENTRY_TYPE, DIRECTION };
