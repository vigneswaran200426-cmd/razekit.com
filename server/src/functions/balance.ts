// @ts-nocheck
// The RazeKit balance, as a user sees it.
//
// One endpoint for both roles, because both need the same guarantee: the number
// on screen is derived from the immutable ledger, and there is no code path
// anywhere that lets the browser change it.
//
// Deliberate wording (§37): "RazeKit balance", "contest funding", "prize
// commitment", "withdrawal request". Not wallet, not escrow, not a regulated
// anything — RazeKit is none of those and the product does not imply otherwise.
import { json } from './context.js';
import { razekitBalance } from '../finance/balances.js';
import { WITHDRAWAL, WITHDRAWAL_COPY, FUNDING, FUNDING_COPY } from '../payments/states.js';
import { paymentMode } from '../payments/config.js';
import { activeSettings } from '../payments/settings.js';

const err = (code, message, status = 400) => json({ error: { code, message } }, status);

/**
 * Balance + a readable transaction history.
 *
 * The history comes from ledger ENTRIES for this user's own accounts, so it can
 * never show another user's movements, and every line traces back to a real
 * posting rather than to a status field somebody set.
 */
export async function balanceOverview(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const svc = ctx.svc;
  const userId = ctx.user.id;
  const role = ctx.user.user_role === 'client' ? 'client' : 'creator';
  const currency = 'INR';

  const balance = await razekitBalance(svc, { userId, currency, role });

  // Only this user's own entries. `owner_id` is stamped by the posting engine
  // from the resolved account, not from anything a caller supplied.
  const entries = await svc.entities.LedgerEntry
    .filter({ owner_id: userId }, '-created_date', 200).catch(() => []);

  const HUMAN = {
    CREDIT: 'Funding received',
    RESERVATION: 'Committed to a contest',
    RELEASE: 'Released back',
    PAYOUT_PENDING: 'Prize awarded to you',
    WITHDRAWAL_RESERVED: 'Reserved for withdrawal',
    PAYOUT_PAID: 'Transferred to your bank',
    REFUND: 'Refund',
    REVERSAL: 'Correction',
    ADJUSTMENT: 'Manual adjustment',
  };

  const transactions = entries.map((e) => ({
    // A stable public reference, not the internal row id.
    reference: e.transaction_reference,
    date: e.posted_at || e.created_date,
    type: HUMAN[e.entry_type] || e.entry_type,
    // Positive when the user gains, negative when they lose. The sign follows
    // the account's normal side rather than the raw debit/credit flag, so it
    // reads the way a person expects.
    amount_minor: e.direction === 'CREDIT' ? Number(e.amount_minor) : -Number(e.amount_minor),
    currency: e.currency,
    balance_after_minor: e.balance_after_minor,
    contest_id: e.contest_id || null,
    description: e.description || '',
  }));

  // Contest-shaped context so a line item can say which contest it belongs to.
  const contestIds = [...new Set(transactions.map((t) => t.contest_id).filter(Boolean))].slice(0, 50);
  const titles = {};
  for (const id of contestIds) {
    const c = await svc.entities.Contest.get(id).catch(() => null);
    if (c) titles[id] = c.title;
  }
  for (const t of transactions) if (t.contest_id) t.contest_title = titles[t.contest_id] || null;

  const [withdrawals, payouts, fundings] = await Promise.all([
    role === 'creator'
      ? svc.entities.WithdrawalRequest.filter({ user_id: userId }, '-created_date', 50).catch(() => [])
      : Promise.resolve([]),
    role === 'creator'
      ? svc.entities.Payout.filter({ creator_id: userId }, '-created_date', 50).catch(() => [])
      : Promise.resolve([]),
    role === 'client'
      ? svc.entities.ContestFunding.filter({ brand_id: userId }, '-created_date', 50).catch(() => [])
      : Promise.resolve([]),
  ]);

  const settings = await activeSettings(svc).catch(() => null);

  return json({
    payment_mode: paymentMode(),
    role,
    balance,
    transactions,
    // Creator surfaces.
    withdrawals: withdrawals.map((w) => ({
      reference: w.reference,
      amount_minor: w.amount_minor,
      currency: w.currency,
      status: w.status,
      status_label: (WITHDRAWAL_COPY[w.status] || {}).label || w.status,
      status_tone: (WITHDRAWAL_COPY[w.status] || {}).tone || 'neutral',
      requested_at: w.requested_at || w.created_date,
      paid_at: w.paid_at || null,
      payment_reference: w.payment_reference || null,
      bank_account_masked: w.bank_account_masked || null,
    })),
    open_withdrawal: withdrawals.some((w) => [
      WITHDRAWAL.REQUESTED, WITHDRAWAL.UNDER_REVIEW, WITHDRAWAL.APPROVED,
      WITHDRAWAL.PROCESSING, WITHDRAWAL.TRANSFER_SENT, WITHDRAWAL.ON_HOLD, WITHDRAWAL.FAILED,
    ].includes(w.status)),
    prizes: payouts.map((p) => ({
      reference: p.reference,
      contest_id: p.contest_id,
      contest_title: p.contest_title || null,
      amount_minor: p.amount_minor,
      status: p.status,
      eligibility_reason: p.eligibility_reason || null,
    })),
    // Client surfaces.
    fundings: fundings.map((f) => ({
      reference: f.reference,
      contest_id: f.contest_id,
      total_amount_minor: f.total_amount_minor,
      currency: f.currency,
      status: f.status,
      status_label: (FUNDING_COPY[f.status] || {}).label || f.status,
      status_tone: (FUNDING_COPY[f.status] || {}).tone || 'neutral',
      verified_at: f.verified_at || null,
      created_date: f.created_date,
    })),
    reserved_contests: fundings
      .filter((f) => f.status === FUNDING.VERIFIED || f.status === FUNDING.OVERPAID)
      .map((f) => ({ contest_id: f.contest_id, reference: f.reference, prize_amount_minor: f.prize_amount_minor })),
    support: { phone: settings?.support_phone || '', email: settings?.support_email || '' },
  });
}
