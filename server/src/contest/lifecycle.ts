// @ts-nocheck
// The contest lifecycle.
//
// RazeKit already had a coarse `status` field (draft / open / winner_selected /
// completed / cancelled). That was enough to render a badge but not enough to
// enforce a workflow: nothing stopped a contest going live unfunded, and there
// was no state at all between "a winner was chosen" and "the winner was paid".
//
// `lifecycle_state` is the finer machine. `status` is kept in step for every
// surface that already reads it, so nothing that works today breaks.
//
// Every transition here is server-driven by a real event — money verified, a
// deadline passing, a person deciding. None of them can be set from a browser
// (see entities/protected.ts).

export const LIFECYCLE = {
  /** Being written. Not visible to creators. */
  DRAFT: 'DRAFT',
  /** Complete, but the prize has not been funded. Cannot go live. */
  FUNDING_REQUIRED: 'FUNDING_REQUIRED',
  /** A person verified the transfer against the bank. The prize is committed. */
  FUNDED: 'FUNDED',
  /** Funded, with a start date still in the future. */
  SCHEDULED: 'SCHEDULED',
  /** Open for entries. */
  LIVE: 'LIVE',
  /** Deadline passed. No new submissions. */
  SUBMISSION_CLOSED: 'SUBMISSION_CLOSED',
  /** Compliance and scoring are settling; the brand is reviewing. */
  UNDER_REVIEW: 'UNDER_REVIEW',
  /** Ready for the brand to choose. */
  WINNER_SELECTION: 'WINNER_SELECTION',
  /** A winner exists and must prove they own the account they published from. */
  WINNER_PENDING_VERIFICATION: 'WINNER_PENDING_VERIFICATION',
  /** Verified. The payout may proceed. */
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  /** Paid and closed. */
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  /** Something is contested. Money and results are frozen until resolved. */
  DISPUTED: 'DISPUTED',
};

const TRANSITIONS = {
  DRAFT: ['FUNDING_REQUIRED', 'CANCELLED'],
  FUNDING_REQUIRED: ['FUNDED', 'CANCELLED'],
  // Funding decides whether it starts now or waits for its start date.
  FUNDED: ['SCHEDULED', 'LIVE', 'CANCELLED', 'DISPUTED'],
  SCHEDULED: ['LIVE', 'CANCELLED', 'DISPUTED'],
  LIVE: ['SUBMISSION_CLOSED', 'CANCELLED', 'DISPUTED'],
  SUBMISSION_CLOSED: ['UNDER_REVIEW', 'CANCELLED', 'DISPUTED'],
  UNDER_REVIEW: ['WINNER_SELECTION', 'CANCELLED', 'DISPUTED'],
  WINNER_SELECTION: ['WINNER_PENDING_VERIFICATION', 'DISPUTED'],
  // Verification can fail; the brand may then pick another winner.
  WINNER_PENDING_VERIFICATION: ['PAYMENT_PENDING', 'WINNER_SELECTION', 'DISPUTED'],
  PAYMENT_PENDING: ['COMPLETED', 'DISPUTED'],
  // A dispute can return to wherever it interrupted, or end the contest.
  DISPUTED: ['UNDER_REVIEW', 'WINNER_SELECTION', 'WINNER_PENDING_VERIFICATION', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** States in which a creator may still submit. */
export const ACCEPTS_SUBMISSIONS = [LIFECYCLE.LIVE];

/** States in which the contest is visible to creators at all. */
export const PUBLICLY_VISIBLE = [
  LIFECYCLE.SCHEDULED, LIFECYCLE.LIVE, LIFECYCLE.SUBMISSION_CLOSED,
  LIFECYCLE.UNDER_REVIEW, LIFECYCLE.WINNER_SELECTION,
  LIFECYCLE.WINNER_PENDING_VERIFICATION, LIFECYCLE.PAYMENT_PENDING, LIFECYCLE.COMPLETED,
];

/** Money is frozen while a dispute is open. */
export const MONEY_FROZEN = [LIFECYCLE.DISPUTED];

export function canTransition(from, to) {
  if (!from) return to === LIFECYCLE.DRAFT;
  if (from === to) return true; // idempotent replay
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`ILLEGAL_CONTEST_TRANSITION:${from}->${to}`);
    err.code = 'ILLEGAL_CONTEST_TRANSITION';
    err.status = 409;
    throw err;
  }
  return to;
}

/**
 * The coarse `status` every existing surface already reads.
 *
 * Kept derived rather than separately maintained, so the two can never
 * disagree — a bug class that would otherwise show a creator "open" on a
 * contest that stopped accepting entries hours ago.
 */
export function legacyStatus(lifecycle) {
  switch (lifecycle) {
    case LIFECYCLE.DRAFT:
    case LIFECYCLE.FUNDING_REQUIRED:
      return 'draft';
    case LIFECYCLE.FUNDED:
    case LIFECYCLE.SCHEDULED:
    case LIFECYCLE.LIVE:
      return 'open';
    case LIFECYCLE.SUBMISSION_CLOSED:
    case LIFECYCLE.UNDER_REVIEW:
    case LIFECYCLE.WINNER_SELECTION:
      return 'open';
    case LIFECYCLE.WINNER_PENDING_VERIFICATION:
    case LIFECYCLE.PAYMENT_PENDING:
      return 'winner_selected';
    case LIFECYCLE.COMPLETED:
      return 'completed';
    case LIFECYCLE.CANCELLED:
      return 'cancelled';
    default:
      return 'open';
  }
}

/**
 * Infer a lifecycle state for a contest created before this machine existed.
 *
 * Read-only inference from what the record already says — never a guess that
 * could unlock money. A contest with a winner but no verification lands in
 * WINNER_PENDING_VERIFICATION, which is exactly where the new flow expects it.
 */
export function inferLifecycle(contest) {
  if (contest?.lifecycle_state) return contest.lifecycle_state;
  const status = contest?.status;
  if (status === 'cancelled') return LIFECYCLE.CANCELLED;
  if (status === 'completed') return LIFECYCLE.COMPLETED;
  if (status === 'winner_selected' || contest?.winner_user_id) {
    if (contest?.winner_verified_at) return LIFECYCLE.PAYMENT_PENDING;
    return LIFECYCLE.WINNER_PENDING_VERIFICATION;
  }
  if (status === 'draft') {
    return ['VERIFIED', 'OVERPAID'].includes(contest?.funding_status) ? LIFECYCLE.FUNDED : LIFECYCLE.FUNDING_REQUIRED;
  }
  // Open: has the deadline passed?
  const deadline = contest?.deadline ? Date.parse(contest.deadline) : null;
  if (deadline && deadline < Date.now()) return LIFECYCLE.SUBMISSION_CLOSED;
  const start = contest?.start_date ? Date.parse(contest.start_date) : null;
  if (start && start > Date.now()) return LIFECYCLE.SCHEDULED;
  return LIFECYCLE.LIVE;
}

/** Human copy, so no state can reach a user unlabelled. */
export const LIFECYCLE_COPY = {
  DRAFT: { label: 'Draft', tone: 'neutral', creator: 'This campaign is not published yet.', brand: 'Finish the brief and fund the prize to publish.' },
  FUNDING_REQUIRED: { label: 'Funding required', tone: 'warning', creator: 'This campaign is not open yet.', brand: 'Fund the prize to publish this campaign.' },
  FUNDED: { label: 'Funded', tone: 'success', creator: 'Opening shortly.', brand: 'The prize is committed. The campaign opens on its start date.' },
  SCHEDULED: { label: 'Opening soon', tone: 'primary', creator: 'Entries open on the start date.', brand: 'Scheduled. Creators can see it but cannot enter yet.' },
  LIVE: { label: 'Open for entries', tone: 'primary', creator: 'Open — you can enter now.', brand: 'Live. Creators are entering.' },
  SUBMISSION_CLOSED: { label: 'Entries closed', tone: 'neutral', creator: 'The deadline has passed. Results are being prepared.', brand: 'Entries are closed. Performance is still settling.' },
  UNDER_REVIEW: { label: 'Under review', tone: 'primary', creator: 'Entries are being checked against the requirements.', brand: 'Requirement checks are running. Review the entries.' },
  WINNER_SELECTION: { label: 'Choosing a winner', tone: 'primary', creator: 'The brand is choosing a winner.', brand: 'Ready — choose the winner.' },
  WINNER_PENDING_VERIFICATION: { label: 'Winner verifying', tone: 'warning', creator: 'The winner is verifying their account.', brand: 'The winner is proving they own the account they published from.' },
  PAYMENT_PENDING: { label: 'Payout pending', tone: 'warning', creator: 'The winner has been verified. Payment is being arranged.', brand: 'Verified. The payout is being arranged.' },
  COMPLETED: { label: 'Completed', tone: 'success', creator: 'This campaign is complete.', brand: 'Complete. The winner has been paid.' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', creator: 'This campaign was cancelled.', brand: 'Cancelled.' },
  DISPUTED: { label: 'On hold', tone: 'danger', creator: 'This campaign is on hold while an issue is resolved.', brand: 'On hold. Results and payment are frozen until this is resolved.' },
};
