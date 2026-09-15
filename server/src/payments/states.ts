// @ts-nocheck
// Funding, withdrawal and refund state machines.
//
// Money states are the one place where "roughly right" is not good enough: a
// wrong transition is a real rupee in the wrong place. Every legal move is
// declared here and enforced by the assert* helpers, so no handler can invent a
// shortcut such as TRANSFER_REPORTED -> VERIFIED without a person having
// actually looked at the bank statement.

// ── Contest funding (manual bank transfer) ──────────────────────────────────
export const FUNDING = {
  /** A contest exists but no money has been asked for yet. */
  FUNDING_REQUIRED: 'FUNDING_REQUIRED',
  /** The client has been shown the payment details. Still nothing received. */
  PAYMENT_INSTRUCTIONS_SHOWN: 'PAYMENT_INSTRUCTIONS_SHOWN',
  /** The client says they transferred. This is a CLAIM, not a payment. */
  TRANSFER_REPORTED: 'TRANSFER_REPORTED',
  /** In the finance queue, waiting for a person to check the bank statement. */
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  /** The reviewer needs something from the client before deciding. */
  NEEDS_INFORMATION: 'NEEDS_INFORMATION',
  /** Real money arrived, but less than the amount due. Credited, not funded. */
  PARTIAL: 'PARTIAL',
  /** Real money arrived, more than the amount due. Funded; excess is spendable or refundable. */
  OVERPAID: 'OVERPAID',
  /** A human matched it against the bank record. Only now is the contest funded. */
  VERIFIED: 'VERIFIED',
  /** A human could not match it. The reason is always recorded and shown. */
  REJECTED: 'REJECTED',
  /** The client or an admin abandoned the request before any money arrived. */
  CANCELLED: 'CANCELLED',
  /** A refund has been approved and is waiting to be transferred. */
  REFUND_PENDING: 'REFUND_PENDING',
  /** The refund transfer has been made and recorded. */
  REFUNDED: 'REFUNDED',
};

const FUNDING_TRANSITIONS = {
  FUNDING_REQUIRED: ['PAYMENT_INSTRUCTIONS_SHOWN', 'CANCELLED'],
  PAYMENT_INSTRUCTIONS_SHOWN: ['TRANSFER_REPORTED', 'CANCELLED'],
  TRANSFER_REPORTED: ['PENDING_VERIFICATION', 'NEEDS_INFORMATION', 'CANCELLED'],
  PENDING_VERIFICATION: ['VERIFIED', 'PARTIAL', 'OVERPAID', 'REJECTED', 'NEEDS_INFORMATION', 'CANCELLED'],
  // The client answers, and the claim goes back round the loop.
  NEEDS_INFORMATION: ['TRANSFER_REPORTED', 'PENDING_VERIFICATION', 'REJECTED', 'CANCELLED'],
  // A shortfall is resolved by a top-up (which re-enters verification) or written off.
  PARTIAL: ['PENDING_VERIFICATION', 'VERIFIED', 'NEEDS_INFORMATION', 'REJECTED', 'REFUND_PENDING'],
  // An overpayment already funds the contest; the excess can be refunded.
  OVERPAID: ['VERIFIED', 'REFUND_PENDING', 'NEEDS_INFORMATION'],
  // Money that arrived can only leave again through a refund.
  VERIFIED: ['REFUND_PENDING'],
  REJECTED: ['TRANSFER_REPORTED', 'CANCELLED'],
  REFUND_PENDING: ['REFUNDED', 'VERIFIED'], // a refund can be called off before it is paid
  // Terminal.
  CANCELLED: [],
  REFUNDED: [],
};

/** States in which the client is expected to make (or re-make) a transfer. */
export const FUNDING_AWAITING_MONEY = [
  FUNDING.FUNDING_REQUIRED,
  FUNDING.PAYMENT_INSTRUCTIONS_SHOWN,
  FUNDING.REJECTED,
  FUNDING.NEEDS_INFORMATION,
  FUNDING.PARTIAL,
];

/** States that occupy the deposit-verification queue. */
export const FUNDING_IN_QUEUE = [
  FUNDING.TRANSFER_REPORTED,
  FUNDING.PENDING_VERIFICATION,
  FUNDING.NEEDS_INFORMATION,
  FUNDING.PARTIAL,
];

/** States in which real money has been confirmed received. */
export const FUNDING_MONEY_RECEIVED = [FUNDING.PARTIAL, FUNDING.VERIFIED, FUNDING.OVERPAID];

/** The only states in which a contest may go live. */
export function isFunded(status) {
  return status === FUNDING.VERIFIED || status === FUNDING.OVERPAID;
}

export function canTransitionFunding(from, to) {
  if (!from) return to === FUNDING.FUNDING_REQUIRED;
  if (from === to) return true; // idempotent replay
  return (FUNDING_TRANSITIONS[from] || []).includes(to);
}

export function assertFundingTransition(from, to) {
  if (!canTransitionFunding(from, to)) {
    const err = new Error(`ILLEGAL_FUNDING_TRANSITION:${from}->${to}`);
    err.code = 'ILLEGAL_FUNDING_TRANSITION';
    err.status = 409;
    throw err;
  }
  return to;
}

// ── Creator withdrawal (manual bank transfer) ───────────────────────────────
//
// The critical rule (§16): requesting a withdrawal must NOT debit the creator.
// It moves money from AVAILABLE into WITHDRAWAL PENDING — a reservation — so
// the same rupee can never be both "available to withdraw" and "already paid".
// The real DEBIT happens only when a person confirms the transfer they made.
export const WITHDRAWAL = {
  REQUESTED: 'REQUESTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  PROCESSING: 'PROCESSING',
  /** The admin has made the bank transfer and entered its reference. */
  TRANSFER_SENT: 'TRANSFER_SENT',
  /** Confirmed settled. This is where the ledger DEBIT is posted. */
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  /** A settled payout undone by a reversal transaction. History is preserved. */
  REVERSED: 'REVERSED',
  ON_HOLD: 'ON_HOLD',
};

const WITHDRAWAL_TRANSITIONS = {
  REQUESTED: ['UNDER_REVIEW', 'APPROVED', 'ON_HOLD', 'FAILED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'ON_HOLD', 'FAILED', 'CANCELLED'],
  APPROVED: ['PROCESSING', 'TRANSFER_SENT', 'ON_HOLD', 'FAILED', 'CANCELLED'],
  PROCESSING: ['TRANSFER_SENT', 'FAILED', 'ON_HOLD'],
  // Confirmation is a separate, deliberate step from "I sent it".
  TRANSFER_SENT: ['PAID', 'FAILED'],
  // A failed transfer returns to the queue; the reservation is never silently dropped.
  FAILED: ['APPROVED', 'PROCESSING', 'CANCELLED'],
  ON_HOLD: ['UNDER_REVIEW', 'APPROVED', 'CANCELLED', 'FAILED'],
  // Paid money is never un-paid by editing a status — only by a reversal.
  PAID: ['REVERSED'],
  CANCELLED: [],
  REVERSED: [],
};

/** States that hold a live reservation against the creator's balance. */
export const WITHDRAWAL_RESERVING = [
  WITHDRAWAL.REQUESTED, WITHDRAWAL.UNDER_REVIEW, WITHDRAWAL.APPROVED,
  WITHDRAWAL.PROCESSING, WITHDRAWAL.TRANSFER_SENT, WITHDRAWAL.ON_HOLD, WITHDRAWAL.FAILED,
];

/** States that occupy the withdrawal queue an admin works through. */
export const WITHDRAWAL_IN_QUEUE = WITHDRAWAL_RESERVING;

export function canTransitionWithdrawal(from, to) {
  if (!from) return to === WITHDRAWAL.REQUESTED;
  if (from === to) return true;
  return (WITHDRAWAL_TRANSITIONS[from] || []).includes(to);
}

export function assertWithdrawalTransition(from, to) {
  if (!canTransitionWithdrawal(from, to)) {
    const err = new Error(`ILLEGAL_WITHDRAWAL_TRANSITION:${from}->${to}`);
    err.code = 'ILLEGAL_WITHDRAWAL_TRANSITION';
    err.status = 409;
    throw err;
  }
  return to;
}

// ── Payout eligibility (per contest win) ────────────────────────────────────
// Distinct from a withdrawal: this describes whether a win has become money the
// creator can actually draw on, not the transfer itself.
export const PAYOUT = {
  PAYOUT_NOT_ELIGIBLE: 'PAYOUT_NOT_ELIGIBLE',
  PAYOUT_ELIGIBLE: 'PAYOUT_ELIGIBLE',
  PAYOUT_REQUESTED: 'PAYOUT_REQUESTED',
  PAYOUT_APPROVED: 'PAYOUT_APPROVED',
  PAYOUT_PROCESSING: 'PAYOUT_PROCESSING',
  PAYOUT_PAID: 'PAYOUT_PAID',
  PAYOUT_REJECTED: 'PAYOUT_REJECTED',
  PAYOUT_FAILED: 'PAYOUT_FAILED',
};

const PAYOUT_TRANSITIONS = {
  PAYOUT_NOT_ELIGIBLE: ['PAYOUT_ELIGIBLE'],
  PAYOUT_ELIGIBLE: ['PAYOUT_REQUESTED'],
  PAYOUT_REQUESTED: ['PAYOUT_APPROVED', 'PAYOUT_REJECTED', 'PAYOUT_ELIGIBLE'],
  PAYOUT_APPROVED: ['PAYOUT_PROCESSING', 'PAYOUT_REJECTED'],
  PAYOUT_PROCESSING: ['PAYOUT_PAID', 'PAYOUT_FAILED'],
  PAYOUT_FAILED: ['PAYOUT_APPROVED', 'PAYOUT_PROCESSING', 'PAYOUT_REJECTED'],
  PAYOUT_REJECTED: ['PAYOUT_REQUESTED', 'PAYOUT_ELIGIBLE'],
  PAYOUT_PAID: [],
};

export function canTransitionPayout(from, to) {
  if (!from) return to === PAYOUT.PAYOUT_NOT_ELIGIBLE || to === PAYOUT.PAYOUT_ELIGIBLE;
  if (from === to) return true;
  return (PAYOUT_TRANSITIONS[from] || []).includes(to);
}

export function assertPayoutTransition(from, to) {
  if (!canTransitionPayout(from, to)) {
    const err = new Error(`ILLEGAL_PAYOUT_TRANSITION:${from}->${to}`);
    err.code = 'ILLEGAL_PAYOUT_TRANSITION';
    err.status = 409;
    throw err;
  }
  return to;
}

// ── Refunds ─────────────────────────────────────────────────────────────────
export const REFUND = {
  REFUND_REQUESTED: 'REFUND_REQUESTED',
  REFUND_REVIEW: 'REFUND_REVIEW',
  REFUND_APPROVED: 'REFUND_APPROVED',
  REFUND_PROCESSING: 'REFUND_PROCESSING',
  REFUNDED: 'REFUNDED',
  REFUND_FAILED: 'REFUND_FAILED',
  REFUND_REJECTED: 'REFUND_REJECTED',
};

const REFUND_TRANSITIONS = {
  REFUND_REQUESTED: ['REFUND_REVIEW', 'REFUND_APPROVED', 'REFUND_REJECTED'],
  REFUND_REVIEW: ['REFUND_APPROVED', 'REFUND_REJECTED'],
  REFUND_APPROVED: ['REFUND_PROCESSING', 'REFUND_REJECTED'],
  REFUND_PROCESSING: ['REFUNDED', 'REFUND_FAILED'],
  REFUND_FAILED: ['REFUND_PROCESSING', 'REFUND_REJECTED'],
  REFUNDED: [],
  REFUND_REJECTED: [],
};

export function canTransitionRefund(from, to) {
  if (!from) return to === REFUND.REFUND_REQUESTED;
  if (from === to) return true;
  return (REFUND_TRANSITIONS[from] || []).includes(to);
}

export function assertRefundTransition(from, to) {
  if (!canTransitionRefund(from, to)) {
    const err = new Error(`ILLEGAL_REFUND_TRANSITION:${from}->${to}`);
    err.code = 'ILLEGAL_REFUND_TRANSITION';
    err.status = 409;
    throw err;
  }
  return to;
}

// ── Reconciliation ──────────────────────────────────────────────────────────
export const RECON = {
  MATCHED: 'MATCHED',
  MISMATCH: 'MISMATCH',
  PARTIAL: 'PARTIAL',
  OVERPAID: 'OVERPAID',
  UNRESOLVED: 'UNRESOLVED',
  RESOLVED: 'RESOLVED',
};

/**
 * Compare what was expected with what the bank actually shows. Deterministic
 * and total: every pair of numbers lands in exactly one state, and "close
 * enough" is not one of them.
 */
export function classifyReconciliation(expectedMinor, actualMinor) {
  const e = Math.round(Number(expectedMinor));
  const a = Math.round(Number(actualMinor));
  if (!Number.isFinite(e) || !Number.isFinite(a)) return RECON.UNRESOLVED;
  if (a === e) return RECON.MATCHED;
  if (a === 0) return RECON.MISMATCH;
  if (a > e) return RECON.OVERPAID;
  return RECON.PARTIAL;
}

// ── Human-facing copy ───────────────────────────────────────────────────────
// Kept beside the states so the UI and the emails cannot drift into describing
// a state RazeKit does not actually have.
export const FUNDING_COPY = {
  FUNDING_REQUIRED: { label: 'Funding required', tone: 'warning', detail: 'This contest needs its prize funded before it can go live.' },
  PAYMENT_INSTRUCTIONS_SHOWN: { label: 'Awaiting your transfer', tone: 'warning', detail: 'Transfer the amount using the payment details shown, then report it here.' },
  TRANSFER_REPORTED: { label: 'Transfer reported', tone: 'primary', detail: 'We have your transfer details and will check them against our bank records.' },
  PENDING_VERIFICATION: { label: 'Being verified', tone: 'primary', detail: 'A member of the RazeKit team is checking this against our bank records.' },
  NEEDS_INFORMATION: { label: 'More information needed', tone: 'warning', detail: 'We need something from you before we can complete this check.' },
  PARTIAL: { label: 'Part payment received', tone: 'warning', detail: 'We received less than the amount due. The balance is still outstanding.' },
  OVERPAID: { label: 'Overpayment received', tone: 'primary', detail: 'We received more than the amount due. The extra is held on your RazeKit balance.' },
  VERIFIED: { label: 'Funded', tone: 'success', detail: 'We matched your transfer. The prize is committed to this contest.' },
  REJECTED: { label: 'Could not be verified', tone: 'danger', detail: 'We could not match this transfer. See the reason and report it again.' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', detail: 'This funding request was cancelled.' },
  REFUND_PENDING: { label: 'Refund in progress', tone: 'warning', detail: 'A refund has been approved and is being transferred back to you.' },
  REFUNDED: { label: 'Refunded', tone: 'neutral', detail: 'This funding was refunded.' },
};

export const WITHDRAWAL_COPY = {
  REQUESTED: { label: 'Requested', tone: 'primary', detail: 'Your request is with the RazeKit finance team.' },
  UNDER_REVIEW: { label: 'Under review', tone: 'primary', detail: 'We are reviewing your request and bank details.' },
  APPROVED: { label: 'Approved', tone: 'primary', detail: 'Approved for transfer. The bank transfer has not been made yet.' },
  PROCESSING: { label: 'Processing', tone: 'warning', detail: 'The bank transfer is being made.' },
  TRANSFER_SENT: { label: 'Transfer sent', tone: 'warning', detail: 'We have made the transfer and are confirming it settled.' },
  PAID: { label: 'Paid', tone: 'success', detail: 'The transfer has been made and recorded with its reference.' },
  FAILED: { label: 'Transfer failed', tone: 'danger', detail: 'The bank transfer did not go through. Your balance was not reduced.' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', detail: 'This request was cancelled and the amount returned to your available balance.' },
  REVERSED: { label: 'Reversed', tone: 'danger', detail: 'This payout was reversed. See the reason on the transaction.' },
  ON_HOLD: { label: 'On hold', tone: 'warning', detail: 'This request is on hold. RazeKit will contact you.' },
};

export const PAYOUT_COPY = {
  PAYOUT_NOT_ELIGIBLE: { label: 'Not yet eligible', tone: 'neutral', detail: 'A prize becomes available once you win a contest whose funding is verified.' },
  PAYOUT_ELIGIBLE: { label: 'Available', tone: 'success', detail: 'This prize is on your RazeKit balance and can be withdrawn.' },
  PAYOUT_REQUESTED: { label: 'Withdrawal requested', tone: 'primary', detail: 'Your withdrawal request is with the RazeKit finance team.' },
  PAYOUT_APPROVED: { label: 'Approved', tone: 'primary', detail: 'Approved for transfer. The bank transfer has not been made yet.' },
  PAYOUT_PROCESSING: { label: 'Transfer in progress', tone: 'warning', detail: 'The bank transfer is being made.' },
  PAYOUT_PAID: { label: 'Paid', tone: 'success', detail: 'The transfer has been made and recorded with its reference.' },
  PAYOUT_REJECTED: { label: 'Needs attention', tone: 'danger', detail: 'See the reason, correct your details and request again.' },
  PAYOUT_FAILED: { label: 'Transfer failed', tone: 'danger', detail: 'The bank transfer did not go through. The finance team will retry it.' },
};
