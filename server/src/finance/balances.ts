// @ts-nocheck
// The RazeKit Balance — one definition, used by every surface.
//
// Deliberate naming (§37): this is a "RazeKit balance", not a wallet and not
// escrow. RazeKit is not a bank, not a regulated wallet and not a payment
// aggregator, so the product never calls it one. The number is a statement of
// what RazeKit's books say it owes or holds for a user, derived from the
// immutable ledger — never a stored counter that code adds to.
//
// Five figures, each with a precise meaning:
//
//   TOTAL        everything the ledger attributes to this user
//   AVAILABLE    usable right now (a client can fund with it; a creator can withdraw it)
//   RESERVED     committed to a specific contest prize and not usable elsewhere
//   PENDING      a withdrawal in flight — no longer available, not yet paid
//   WITHDRAWABLE what a creator may request today, after minimums and holds
//
// Plus PAID_OUT, which is history rather than balance: money that has left.
import { ACCOUNT_CLASS, balanceOf } from '../ledger/accounts.js';

/** Smallest withdrawal RazeKit will process manually, in minor units (₹100). */
export const MIN_WITHDRAWAL_MINOR = 10000;

/**
 * Compute a user's balance from the ledger.
 *
 * Every figure here is a replay of ledger entries. If this function and a
 * cached column ever disagree, this one is right — which is why reconciliation
 * compares them rather than trusting either.
 */
export async function razekitBalance(svc, { userId, currency = 'INR', role }) {
  const isClient = role === 'client';

  const [clientFunds, owed, withdrawalPending] = await Promise.all([
    balanceOf(svc, { accountClass: ACCOUNT_CLASS.CLIENT_FUNDS, currency, subjectId: userId }),
    balanceOf(svc, { accountClass: ACCOUNT_CLASS.PAYOUT_LIABILITY, currency, subjectId: userId }),
    balanceOf(svc, { accountClass: ACCOUNT_CLASS.WITHDRAWAL_PENDING, currency, subjectId: userId }),
  ]);

  // A client's "reserved" is the sum of prize commitments across their own
  // contests. Read per-contest so one brand can never see another's.
  let reserved = 0;
  if (isClient) {
    const reservations = await svc.entities.LedgerTransaction
      .filter({ brand_id: userId, txn_type: 'PRIZE_RESERVED' }, '-created_date', 500).catch(() => []);
    const contestIds = [...new Set(reservations.map((t) => t.contest_id).filter(Boolean))];
    for (const cid of contestIds) {
      const b = await balanceOf(svc, { accountClass: ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, currency, subjectId: cid });
      reserved += b.balance_minor;
    }
  }

  // Money that has actually left RazeKit for this user, read from the ledger
  // rather than summed from payout rows — the ledger is the record.
  const paidEntries = await svc.entities.LedgerEntry
    .filter({ owner_id: userId, entry_type: 'PAYOUT_PAID' }, '-created_date', 1000).catch(() => []);
  const paidOut = paidEntries
    .filter((e) => e.direction === 'DEBIT')
    .reduce((a, e) => a + Number(e.amount_minor || 0), 0);

  const available = isClient ? clientFunds.balance_minor : owed.balance_minor;
  const pending = withdrawalPending.balance_minor;
  const total = available + reserved + pending;

  // Clients do not withdraw in the beta — their money leaves through a refund,
  // which is a different, reviewed flow. Saying 0 is more honest than showing a
  // button that cannot work.
  const withdrawable = isClient ? 0 : Math.max(0, available);

  return {
    currency,
    total_minor: total,
    available_minor: available,
    reserved_minor: reserved,
    pending_minor: pending,
    withdrawable_minor: withdrawable,
    paid_out_minor: paidOut,
    min_withdrawal_minor: MIN_WITHDRAWAL_MINOR,
    can_withdraw: !isClient && withdrawable >= MIN_WITHDRAWAL_MINOR,
    // Shown next to the numbers so a user is never left guessing what a label
    // means or why an amount is not usable yet.
    definitions: isClient
      ? {
          total: 'Everything RazeKit holds for you.',
          available: 'Verified funding not yet committed to a contest.',
          reserved: 'Prize money committed to your live contests.',
          pending: 'Not applicable to client accounts.',
          withdrawable: 'Client funds are returned by refund request, not withdrawal.',
          paid_out: 'Prize money already paid to winning creators from your contests.',
        }
      : {
          total: 'Everything RazeKit currently owes you.',
          available: 'Prize money you have won and can withdraw.',
          reserved: 'Not applicable to creator accounts.',
          pending: 'A withdrawal you have requested that has not been transferred yet.',
          withdrawable: `What you can request today (minimum ${MIN_WITHDRAWAL_MINOR / 100} ${currency}).`,
          paid_out: 'Money already transferred to your bank account.',
        },
  };
}

/**
 * Refresh the Wallet row from the ledger.
 *
 * Wallet is a READ MODEL, never an input. Rebuilding it from ledger balances is
 * why the Tracker and the balance page can no longer disagree about what a
 * creator has earned.
 */
export async function projectBalance(svc, { userId, currency = 'INR', role }) {
  const b = await razekitBalance(svc, { userId, currency, role });

  const existing = await svc.entities.Wallet.filter({ user_id: userId, currency }, '-created_date', 1).catch(() => []);
  const patch = {
    user_id: userId,
    currency,
    available_balance_minor: b.available_minor,
    pending_balance_minor: b.pending_minor,
    reserved_funds_minor: b.reserved_minor,
    total_deposits_minor: b.total_minor,
    lifetime_earnings_minor: b.paid_out_minor,
    // Major-unit mirrors for surfaces that predate minor units.
    available_balance: b.available_minor / 100,
    pending_balance: b.pending_minor / 100,
    reserved_funds: b.reserved_minor / 100,
    total_deposits: b.total_minor / 100,
    lifetime_earnings: b.paid_out_minor / 100,
    projected_at: new Date().toISOString(),
  };

  const row = existing.length
    ? await svc.entities.Wallet.update(existing[0].id, patch)
    : await svc.entities.Wallet.create(patch);
  return { wallet: row, balance: b };
}
