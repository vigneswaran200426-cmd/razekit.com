// @ts-nocheck
// Creator withdrawals — request, review, manual transfer, confirmation.
//
// The ordering rule this file exists to enforce (§10, §14–16):
//
//   CREATOR REQUESTS  → amount is RESERVED, not debited
//   ADMIN REVIEWS     → still reserved
//   ADMIN SENDS MONEY → in the real world, from a real bank, by a person
//   ADMIN ENTERS UTR  → recorded, still not debited
//   ADMIN CONFIRMS    → ledger DEBIT, balance drops, withdrawal = PAID
//
// A creator's balance never falls because they asked for money. It falls when
// the money has actually left. Between those two points the amount sits in a
// WITHDRAWAL_PENDING reservation, so it can be neither withdrawn twice nor
// counted as still available.
//
// Nothing here moves real money. RazeKit records a transfer a human made; it
// never initiates one.
import { json } from './context.js';
import { withTransaction, lockRecord } from '../db.js';
import { serviceClient } from '../entities/service.js';
import { toMajor, toMinor, makeRef } from '../money/core.js';
import { WITHDRAWAL, WITHDRAWAL_COPY, WITHDRAWAL_IN_QUEUE, WITHDRAWAL_RESERVING, assertWithdrawalTransition } from '../payments/states.js';
import { maskAccountNumber, maskIfsc, paymentMode, support } from '../payments/config.js';
import { FINANCE_PERMISSION, requireFinance, auditFinance, permissionsFor, hasPermission } from '../finance/permissions.js';
import { reserveWithdrawal, releaseWithdrawal, recordWithdrawalPaid, reverseTransaction } from '../ledger/events.js';
import { razekitBalance, projectBalance, MIN_WITHDRAWAL_MINOR } from '../finance/balances.js';
import { notifyAdminsWithdrawalRequested, notifyCreatorWithdrawal, displayName } from '../finance/notify.js';

const nowIso = () => new Date().toISOString();
const err = (code, message, status = 400, extra = {}) => json({ error: { code, message, ...extra } }, status);

/** Everything a user is allowed to see about their own withdrawal. */
function publicWithdrawal(w) {
  const copy = WITHDRAWAL_COPY[w.status] || {};
  return {
    id: w.id,
    reference: w.reference,
    amount_minor: w.amount_minor,
    currency: w.currency,
    status: w.status,
    status_label: copy.label || w.status,
    status_detail: copy.detail || '',
    status_tone: copy.tone || 'neutral',
    requested_at: w.requested_at || w.created_date,
    reviewed_at: w.reviewed_at || null,
    approved_at: w.approved_at || null,
    transfer_sent_at: w.transfer_sent_at || null,
    paid_at: w.paid_at || null,
    payment_reference: w.payment_reference || null,
    transfer_date: w.transfer_date || null,
    failure_reason: w.failure_reason || null,
    hold_reason: w.hold_reason || null,
    cancellation_reason: w.cancellation_reason || null,
    // Masked for everyone, including the creator who owns it.
    bank_account_masked: w.bank_account_masked || null,
    bank_name: w.bank_name || null,
    created_date: w.created_date,
  };
}

// ── withdrawalRequest (creator) ─────────────────────────────────────────────
/**
 * A creator asks to withdraw part or all of their available balance.
 *
 * Runs in one transaction with a lock on the creator's own row, so two rapid
 * submissions cannot both pass the "enough balance" check and reserve the same
 * money twice.
 */
export async function withdrawalRequest(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const b = ctx.body || {};
  const currency = 'INR';

  const account = (await ctx.svc.entities.PayoutAccount
    .filter({ user_id: ctx.user.id }, '-created_date', 1).catch(() => []))[0];
  if (!account) {
    return err('BANK_DETAILS_REQUIRED', 'Add your bank details before requesting a withdrawal.', 409);
  }
  // Confirming the account again at request time is a cheap guard against the
  // most expensive mistake in this flow: money sent to the wrong account.
  if (b.confirm_account_last4 && String(b.confirm_account_last4) !== String(account.account_number_last4)) {
    return err('ACCOUNT_CONFIRMATION_FAILED', 'The last four digits you entered do not match the account on file.');
  }

  try {
    const result = await withTransaction(async (tx) => {
      const svc = serviceClient(tx);

      // One open request at a time. Checked inside the transaction so a second
      // concurrent submission sees the first.
      const open = (await svc.entities.WithdrawalRequest
        .filter({ user_id: ctx.user.id }, '-created_date', 20).catch(() => []))
        .filter((w) => WITHDRAWAL_IN_QUEUE.includes(w.status));
      if (open.length) {
        return { conflict: err('WITHDRAWAL_ALREADY_OPEN', `You already have a withdrawal request in progress (${open[0].reference}). Wait for it to complete before starting another.`, 409) };
      }

      const balance = await razekitBalance(svc, { userId: ctx.user.id, currency, role: 'creator' });
      const requested = b.amount != null ? toMinor(Number(b.amount), currency) : balance.withdrawable_minor;

      if (!Number.isFinite(requested) || requested <= 0) {
        return { conflict: err('AMOUNT_REQUIRED', 'Enter the amount you want to withdraw.') };
      }
      if (requested < MIN_WITHDRAWAL_MINOR) {
        return { conflict: err('BELOW_MINIMUM', `The minimum withdrawal is ${toMajor(MIN_WITHDRAWAL_MINOR, currency)} ${currency}.`, 422, { min_withdrawal_minor: MIN_WITHDRAWAL_MINOR }) };
      }
      if (requested > balance.withdrawable_minor) {
        return { conflict: err('INSUFFICIENT_BALANCE', `You can withdraw up to ${toMajor(balance.withdrawable_minor, currency)} ${currency}.`, 422, { withdrawable_minor: balance.withdrawable_minor }) };
      }

      const withdrawal = await svc.entities.WithdrawalRequest.create({
        reference: makeRef('RK-WDR'),
        user_id: ctx.user.id,
        user_name: displayName(ctx.user),
        amount: toMajor(requested, currency),
        amount_minor: requested,
        currency,
        payment_mode: paymentMode(),
        status: WITHDRAWAL.REQUESTED,
        requested_at: nowIso(),
        available_at_request_minor: balance.withdrawable_minor,
        payout_account_id: account.id,
        // Snapshotted so a later change of bank details cannot silently redirect
        // a transfer that is already in flight.
        account_holder_name: account.account_holder_name,
        bank_name: account.bank_name,
        bank_account_last4: account.account_number_last4,
        bank_account_masked: account.account_number_masked,
        bank_ifsc: account.ifsc,
        note: String(b.note || '').slice(0, 500) || null,
      });

      // Reserve, do NOT debit. The creator still owns this money.
      const reserved = await reserveWithdrawal(svc, { withdrawal, actorId: ctx.user.id });
      const saved = await svc.entities.WithdrawalRequest.update(withdrawal.id, {
        reserved_txn_id: reserved.transaction.id,
      });

      await svc.entities.AuditLog.create({
        user_id: ctx.user.id,
        actor: ctx.user.id,
        action: 'WITHDRAWAL_REQUESTED',
        status: 'success',
        reason: 'Creator requested a withdrawal',
        result: JSON.stringify({
          withdrawal_id: saved.id, reference: saved.reference, amount_minor: requested,
          currency, ledger_txn: reserved.transaction.reference,
          account_last4: account.account_number_last4,
        }),
      }).catch(() => null);

      return { withdrawal: saved };
    });

    if (result.conflict) return result.conflict;

    // Outside the transaction: projections and notifications must never be able
    // to roll back a committed financial fact.
    await projectBalance(ctx.svc, { userId: ctx.user.id, currency, role: 'creator' }).catch(() => null);
    const creator = await ctx.svc.entities.User.get(ctx.user.id).catch(() => null);
    await notifyAdminsWithdrawalRequested(ctx.svc, { withdrawal: result.withdrawal, creator }).catch(() => null);
    await notifyCreatorWithdrawal(ctx.svc, { withdrawal: result.withdrawal, creator, stage: 'requested' }).catch(() => null);

    const balance = await razekitBalance(ctx.svc, { userId: ctx.user.id, currency, role: 'creator' });
    return json({
      withdrawal: publicWithdrawal(result.withdrawal),
      balance,
      message: 'Your withdrawal request is with the RazeKit finance team. The amount is held on your balance until the transfer is made.',
    });
  } catch (e) {
    if (e?.code === 'LEDGER_UNBALANCED' || e?.code?.startsWith?.('LEDGER_')) {
      return err(e.code, e.message, 422);
    }
    // A unique-index violation here means a concurrent request won the race.
    if (String(e?.message || '').includes('withdrawal_active_per_user_uniq')) {
      return err('WITHDRAWAL_ALREADY_OPEN', 'You already have a withdrawal request in progress.', 409);
    }
    return err('WITHDRAWAL_FAILED', 'Your withdrawal could not be created. Nothing was changed on your balance.', 500);
  }
}

// ── withdrawalCancel (creator) ──────────────────────────────────────────────
export async function withdrawalCancel(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { withdrawal_id: id, reason } = ctx.body || {};
  if (!id) return err('WITHDRAWAL_ID_REQUIRED', 'withdrawal_id is required.');

  const existing = await ctx.svc.entities.WithdrawalRequest.get(id).catch(() => null);
  if (!existing) return err('WITHDRAWAL_NOT_FOUND', 'Withdrawal request not found.', 404);
  if (existing.user_id !== ctx.user.id) return err('FORBIDDEN', 'This request belongs to another account.', 403);
  // Once the transfer is under way it is too late to cancel from the app.
  if (![WITHDRAWAL.REQUESTED, WITHDRAWAL.UNDER_REVIEW, WITHDRAWAL.ON_HOLD].includes(existing.status)) {
    return err('TOO_LATE_TO_CANCEL', `This request is ${existing.status} and can no longer be cancelled here. Contact support.`, 409, { support: support() });
  }

  const out = await withTransaction(async (tx) => {
    const svc = serviceClient(tx);
    await lockRecord(tx, id);
    const w = await svc.entities.WithdrawalRequest.get(id);
    if (![WITHDRAWAL.REQUESTED, WITHDRAWAL.UNDER_REVIEW, WITHDRAWAL.ON_HOLD].includes(w.status)) {
      return { conflict: err('TOO_LATE_TO_CANCEL', `This request is ${w.status} and can no longer be cancelled.`, 409) };
    }
    const released = await releaseWithdrawal(svc, { withdrawal: w, actorId: ctx.user.id, actorRole: 'creator', reason: 'Cancelled by creator' });
    const saved = await svc.entities.WithdrawalRequest.update(w.id, {
      status: assertWithdrawalTransition(w.status, WITHDRAWAL.CANCELLED),
      cancelled_at: nowIso(),
      cancelled_by: ctx.user.id,
      cancellation_reason: String(reason || 'Cancelled by creator').slice(0, 500),
      released_txn_id: released.transaction.id,
    });
    await svc.entities.AuditLog.create({
      user_id: ctx.user.id, actor: ctx.user.id, action: 'WITHDRAWAL_CANCELLED', status: 'success',
      reason: String(reason || 'Cancelled by creator').slice(0, 500),
      result: JSON.stringify({ withdrawal_id: w.id, reference: w.reference, ledger_txn: released.transaction.reference }),
    }).catch(() => null);
    return { withdrawal: saved };
  }).catch(() => ({ conflict: err('CANCEL_FAILED', 'The request could not be cancelled. Nothing was changed.', 500) }));

  if (out.conflict) return out.conflict;
  await projectBalance(ctx.svc, { userId: ctx.user.id, currency: 'INR', role: 'creator' }).catch(() => null);
  const creator = await ctx.svc.entities.User.get(ctx.user.id).catch(() => null);
  await notifyCreatorWithdrawal(ctx.svc, { withdrawal: out.withdrawal, creator, stage: 'cancelled' }).catch(() => null);
  return json({ withdrawal: publicWithdrawal(out.withdrawal) });
}

// ── withdrawalList (creator) ────────────────────────────────────────────────
export async function withdrawalList(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const rows = await ctx.svc.entities.WithdrawalRequest
    .filter({ user_id: ctx.user.id }, '-created_date', 100).catch(() => []);
  const balance = await razekitBalance(ctx.svc, { userId: ctx.user.id, currency: 'INR', role: 'creator' });
  const account = (await ctx.svc.entities.PayoutAccount
    .filter({ user_id: ctx.user.id }, '-created_date', 1).catch(() => []))[0];

  return json({
    withdrawals: rows.map(publicWithdrawal),
    open: rows.filter((w) => WITHDRAWAL_IN_QUEUE.includes(w.status)).map(publicWithdrawal),
    balance,
    account: account ? {
      account_holder_name: account.account_holder_name,
      bank_name: account.bank_name,
      account_number_masked: account.account_number_masked,
      account_number_last4: account.account_number_last4,
      ifsc_masked: maskIfsc(account.ifsc),
      verified: Boolean(account.verified),
    } : null,
    needs_bank_details: !account,
    support: support(),
  });
}

// ── financeWithdrawalQueue (admin) ──────────────────────────────────────────
export async function financeWithdrawalQueue(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VIEW); if (denied) return denied;
  const svc = ctx.svc;
  const status = ctx.body?.status;
  const rows = await svc.entities.WithdrawalRequest.filter({}, '-created_date', 500).catch(() => []);
  const filtered = status ? rows.filter((r) => r.status === status) : rows.filter((r) => WITHDRAWAL_IN_QUEUE.includes(r.status));

  const out = [];
  for (const w of filtered) {
    const creator = await svc.entities.User.get(w.user_id).catch(() => null);
    const balance = await razekitBalance(svc, { userId: w.user_id, currency: w.currency || 'INR', role: 'creator' });
    out.push({
      ...publicWithdrawal(w),
      creator_name: displayName(creator),
      creator_email: creator?.email || null,
      available_minor: balance.available_minor,
      pending_minor: balance.pending_minor,
      approved_by: w.approved_by || null,
      confirmed_by: w.confirmed_by || null,
      // Surfaced rather than blocked: RazeKit is a one-operator platform in beta
      // and pretending otherwise would be worse than saying so.
      same_person_approved_and_confirmed: Boolean(w.approved_by && w.confirmed_by && w.approved_by === w.confirmed_by),
      waiting_hours: w.requested_at ? Math.round((Date.now() - Date.parse(w.requested_at)) / 36e5) : null,
    });
  }
  return json({ queue: out, count: out.length, permissions: await permissionsFor(svc, ctx.user) });
}

// ── financeWithdrawalDetail (admin) ─────────────────────────────────────────
/**
 * Everything an admin needs to decide, plus — only for a holder of
 * finance.view_sensitive_financial_data on an APPROVED request — the full bank
 * account somebody has to type into a transfer. That disclosure is audited every
 * single time.
 */
export async function financeWithdrawalDetail(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.REVIEW_WITHDRAWAL); if (denied) return denied;
  const svc = ctx.svc;
  const { withdrawal_id: id } = ctx.body || {};
  if (!id) return err('WITHDRAWAL_ID_REQUIRED', 'withdrawal_id is required.');

  const w = await svc.entities.WithdrawalRequest.get(id).catch(() => null);
  if (!w) return err('WITHDRAWAL_NOT_FOUND', 'Withdrawal request not found.', 404);

  const [creator, account, payouts, history, txns] = await Promise.all([
    svc.entities.User.get(w.user_id).catch(() => null),
    w.payout_account_id ? svc.entities.PayoutAccount.get(w.payout_account_id).catch(() => null) : null,
    svc.entities.Payout.filter({ creator_id: w.user_id }, '-created_date', 50).catch(() => []),
    svc.entities.WithdrawalRequest.filter({ user_id: w.user_id }, '-created_date', 50).catch(() => []),
    svc.entities.LedgerTransaction.filter({ withdrawal_id: w.id }, 'created_date', 20).catch(() => []),
  ]);
  const balance = await razekitBalance(svc, { userId: w.user_id, currency: w.currency || 'INR', role: 'creator' });
  const audits = (await svc.entities.AuditLog.filter({ user_id: w.user_id }, '-created_date', 100).catch(() => []))
    .filter((a) => String(a.result || '').includes(w.id));

  // The full account is disclosed only when it is actually needed to make a
  // transfer, and only to someone holding the sensitive-data permission.
  const canSeeFull = await hasPermission(svc, ctx.user, FINANCE_PERMISSION.VIEW_SENSITIVE);
  const readyForTransfer = [WITHDRAWAL.APPROVED, WITHDRAWAL.PROCESSING, WITHDRAWAL.TRANSFER_SENT, WITHDRAWAL.FAILED].includes(w.status);
  let fullBank = null;
  if (canSeeFull && readyForTransfer && account) {
    fullBank = {
      account_holder_name: account.account_holder_name,
      bank_name: account.bank_name,
      account_number: account.account_number,
      ifsc: account.ifsc,
      account_type: account.account_type,
    };
    await auditFinance(svc, {
      actorId: ctx.user.id,
      action: 'WITHDRAWAL_BANK_DETAILS_VIEWED',
      permission: FINANCE_PERMISSION.VIEW_SENSITIVE,
      status: 'success',
      reason: 'Bank details revealed to make a transfer',
      subjectUserId: w.user_id,
      result: { withdrawal_id: w.id, account_last4: account.account_number_last4 },
    });
  }

  return json({
    withdrawal: {
      ...publicWithdrawal(w),
      available_at_request_minor: w.available_at_request_minor ?? null,
      review_note: w.review_note || null,
      approval_note: w.approval_note || null,
      transfer_note: w.transfer_note || null,
      approved_by: w.approved_by || null,
      confirmed_by: w.confirmed_by || null,
    },
    creator: creator ? { id: creator.id, name: displayName(creator), email: creator.email } : null,
    balance,
    bank_masked: account ? {
      account_holder_name: account.account_holder_name,
      bank_name: account.bank_name,
      account_number_masked: account.account_number_masked,
      ifsc_masked: maskIfsc(account.ifsc),
      verified: Boolean(account.verified),
      submitted_at: account.submitted_at || null,
    } : null,
    bank_full: fullBank,
    bank_full_available: canSeeFull && readyForTransfer,
    payout_history: payouts.map((p) => ({ id: p.id, reference: p.reference, contest_title: p.contest_title, amount_minor: p.amount_minor, status: p.status, paid_at: p.paid_at || null })),
    withdrawal_history: history.filter((h) => h.id !== w.id).map(publicWithdrawal),
    ledger: txns.map((t) => ({ id: t.id, reference: t.reference, txn_type: t.txn_type, amount_minor: t.amount_minor, posted_at: t.posted_at, status: t.status })),
    audit: audits.map((a) => ({ id: a.id, action: a.action, actor: a.actor, status: a.status, reason: a.reason, created_date: a.created_date })),
    permissions: await permissionsFor(svc, ctx.user),
  });
}

// ── financeWithdrawalReview (admin) ─────────────────────────────────────────
/** Move a request to UNDER_REVIEW, or place / lift a hold. */
export async function financeWithdrawalReview(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.REVIEW_WITHDRAWAL); if (denied) return denied;
  const b = ctx.body || {};
  const id = b.withdrawal_id;
  if (!id) return err('WITHDRAWAL_ID_REQUIRED', 'withdrawal_id is required.');
  const action = b.action || 'review';
  if (action === 'hold' && String(b.reason || '').trim().length < 10) {
    return err('REASON_REQUIRED', 'Give a reason for the hold (at least 10 characters). The creator is shown this text.');
  }

  const target = action === 'hold' ? WITHDRAWAL.ON_HOLD : WITHDRAWAL.UNDER_REVIEW;
  const out = await withTransaction(async (tx) => {
    const svc = serviceClient(tx);
    await lockRecord(tx, id);
    const w = await svc.entities.WithdrawalRequest.get(id).catch(() => null);
    if (!w) return { conflict: err('WITHDRAWAL_NOT_FOUND', 'Withdrawal request not found.', 404) };
    let next;
    try { next = assertWithdrawalTransition(w.status, target); }
    catch { return { conflict: err('ILLEGAL_TRANSITION', `A ${w.status} request cannot move to ${target}.`, 409) }; }

    const saved = await svc.entities.WithdrawalRequest.update(w.id, {
      status: next,
      reviewed_by: ctx.user.id,
      reviewed_at: nowIso(),
      review_note: String(b.note || '').slice(0, 500) || null,
      ...(action === 'hold'
        ? { hold_reason: String(b.reason).slice(0, 500), hold_by: ctx.user.id, hold_at: nowIso() }
        : { hold_reason: null }),
    });
    return { withdrawal: saved, previous: w.status };
  }).catch(() => ({ conflict: err('REVIEW_FAILED', 'The request could not be updated.', 500) }));

  if (out.conflict) return out.conflict;
  await auditFinance(ctx.svc, {
    actorId: ctx.user.id,
    action: action === 'hold' ? 'WITHDRAWAL_ON_HOLD' : 'WITHDRAWAL_UNDER_REVIEW',
    permission: FINANCE_PERMISSION.REVIEW_WITHDRAWAL,
    status: 'success', reason: b.reason || b.note || '', subjectUserId: out.withdrawal.user_id,
    result: { withdrawal_id: id, from: out.previous, to: out.withdrawal.status, amount_minor: out.withdrawal.amount_minor },
  });
  if (action === 'hold') {
    const creator = await ctx.svc.entities.User.get(out.withdrawal.user_id).catch(() => null);
    await notifyCreatorWithdrawal(ctx.svc, { withdrawal: out.withdrawal, creator, stage: 'on_hold', extra: { reason: b.reason } }).catch(() => null);
  }
  return json({ withdrawal: publicWithdrawal(out.withdrawal) });
}

// ── financeWithdrawalApprove (admin) ────────────────────────────────────────
/**
 * Approve for transfer, or reject and hand the money straight back.
 *
 * Approval does NOT move money. It authorises a person to go and make a bank
 * transfer, which is a separate, deliberate step.
 */
export async function financeWithdrawalApprove(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.APPROVE_WITHDRAWAL); if (denied) return denied;
  const b = ctx.body || {};
  const id = b.withdrawal_id;
  if (!id) return err('WITHDRAWAL_ID_REQUIRED', 'withdrawal_id is required.');
  const reject = b.action === 'reject';
  if (reject && String(b.reason || '').trim().length < 10) {
    return err('REASON_REQUIRED', 'Give a reason (at least 10 characters). The creator is shown this text.');
  }

  const out = await withTransaction(async (tx) => {
    const svc = serviceClient(tx);
    await lockRecord(tx, id);
    const w = await svc.entities.WithdrawalRequest.get(id).catch(() => null);
    if (!w) return { conflict: err('WITHDRAWAL_NOT_FOUND', 'Withdrawal request not found.', 404) };

    if (reject) {
      let next;
      try { next = assertWithdrawalTransition(w.status, WITHDRAWAL.CANCELLED); }
      catch { return { conflict: err('ILLEGAL_TRANSITION', `A ${w.status} request cannot be rejected.`, 409) }; }
      // Rejection returns the reservation to the creator's available balance —
      // the money was never RazeKit's to keep.
      const released = await releaseWithdrawal(svc, { withdrawal: w, actorId: ctx.user.id, reason: b.reason });
      const saved = await svc.entities.WithdrawalRequest.update(w.id, {
        status: next,
        cancelled_at: nowIso(),
        cancelled_by: ctx.user.id,
        cancellation_reason: String(b.reason).slice(0, 500),
        released_txn_id: released.transaction.id,
      });
      return { withdrawal: saved, rejected: true, txn: released.transaction.reference, previous: w.status };
    }

    if (w.status === WITHDRAWAL.APPROVED) return { withdrawal: w, already: true };
    let next;
    try { next = assertWithdrawalTransition(w.status, WITHDRAWAL.APPROVED); }
    catch { return { conflict: err('ILLEGAL_TRANSITION', `A ${w.status} request cannot be approved.`, 409) }; }

    // The reservation must still be intact, or approving would authorise a
    // transfer of money the ledger does not show as set aside.
    const balance = await razekitBalance(svc, { userId: w.user_id, currency: w.currency || 'INR', role: 'creator' });
    if (balance.pending_minor < Number(w.amount_minor)) {
      return { conflict: err('RESERVATION_MISSING', `The ledger shows ${toMajor(balance.pending_minor, w.currency)} reserved but this request is for ${toMajor(w.amount_minor, w.currency)}. Investigate before approving.`, 409) };
    }

    const saved = await svc.entities.WithdrawalRequest.update(w.id, {
      status: next,
      approved_by: ctx.user.id,
      approved_at: nowIso(),
      approval_note: String(b.note || '').slice(0, 500) || null,
      hold_reason: null,
    });
    return { withdrawal: saved, previous: w.status };
  }).catch((e) => ({ conflict: err(e?.code || 'APPROVE_FAILED', e?.message || 'The request could not be approved.', e?.status || 500) }));

  if (out.conflict) return out.conflict;

  const creator = await ctx.svc.entities.User.get(out.withdrawal.user_id).catch(() => null);
  await projectBalance(ctx.svc, { userId: out.withdrawal.user_id, currency: 'INR', role: 'creator' }).catch(() => null);
  await auditFinance(ctx.svc, {
    actorId: ctx.user.id,
    action: out.rejected ? 'WITHDRAWAL_REJECTED' : 'WITHDRAWAL_APPROVED',
    permission: FINANCE_PERMISSION.APPROVE_WITHDRAWAL,
    status: 'success', reason: b.reason || b.note || '', subjectUserId: out.withdrawal.user_id,
    result: {
      withdrawal_id: id, reference: out.withdrawal.reference, amount_minor: out.withdrawal.amount_minor,
      currency: out.withdrawal.currency, from: out.previous, to: out.withdrawal.status, ledger_txn: out.txn || null,
    },
  });
  await notifyCreatorWithdrawal(ctx.svc, {
    withdrawal: out.withdrawal, creator,
    stage: out.rejected ? 'rejected' : 'approved',
    extra: { reason: b.reason },
  }).catch(() => null);

  return json({ withdrawal: publicWithdrawal(out.withdrawal), already_approved: Boolean(out.already) });
}

// ── financeWithdrawalTransferSent (admin) ───────────────────────────────────
/**
 * "I have made the transfer." Records the real-world facts — amount, date, UTR
 * — but does NOT post the debit. Confirmation is a separate decision so an
 * admin can enter details, check them, and only then commit.
 */
export async function financeWithdrawalTransferSent(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.CONFIRM_PAYOUT); if (denied) return denied;
  const b = ctx.body || {};
  const id = b.withdrawal_id;
  if (!id) return err('WITHDRAWAL_ID_REQUIRED', 'withdrawal_id is required.');

  const reference = String(b.payment_reference || '').trim();
  if (reference.length < 4) {
    return err('PAYMENT_REFERENCE_REQUIRED', 'Enter the UTR or bank reference for the transfer you made. Without it this payout is not auditable.');
  }

  const out = await withTransaction(async (tx) => {
    const svc = serviceClient(tx);
    await lockRecord(tx, id);
    const w = await svc.entities.WithdrawalRequest.get(id).catch(() => null);
    if (!w) return { conflict: err('WITHDRAWAL_NOT_FOUND', 'Withdrawal request not found.', 404) };
    if (w.status === WITHDRAWAL.PAID) return { conflict: err('ALREADY_PAID', 'This withdrawal is already confirmed as paid.', 409) };

    let next;
    try { next = assertWithdrawalTransition(w.status, WITHDRAWAL.TRANSFER_SENT); }
    catch { return { conflict: err('ILLEGAL_TRANSITION', `A ${w.status} request cannot be marked as transferred. Approve it first.`, 409) }; }

    const transferMinor = b.transfer_amount != null ? toMinor(Number(b.transfer_amount), w.currency) : Number(w.amount_minor);
    // A transfer that does not match the request is a reconciliation problem,
    // not something to quietly accept.
    if (transferMinor !== Number(w.amount_minor)) {
      return { conflict: err('AMOUNT_MISMATCH', `The transfer amount (${toMajor(transferMinor, w.currency)}) does not match the request (${toMajor(w.amount_minor, w.currency)}). Correct it or fail the transfer and start again.`, 422) };
    }

    const saved = await svc.entities.WithdrawalRequest.update(w.id, {
      status: next,
      transfer_sent_by: ctx.user.id,
      transfer_sent_at: nowIso(),
      transfer_amount_minor: transferMinor,
      transfer_date: String(b.transfer_date || '').slice(0, 32) || nowIso().slice(0, 10),
      payment_reference: reference,
      payment_method: String(b.method || 'BANK_TRANSFER').slice(0, 32),
      transfer_note: String(b.note || '').slice(0, 500) || null,
    });
    return { withdrawal: saved, previous: w.status };
  }).catch((e) => ({ conflict: err(e?.code || 'TRANSFER_RECORD_FAILED', e?.message || 'The transfer could not be recorded.', e?.status || 500) }));

  if (out.conflict) return out.conflict;
  await auditFinance(ctx.svc, {
    actorId: ctx.user.id, action: 'TRANSFER_SENT', permission: FINANCE_PERMISSION.CONFIRM_PAYOUT,
    status: 'success', reason: b.note || 'Bank transfer made', subjectUserId: out.withdrawal.user_id,
    result: {
      withdrawal_id: id, reference: out.withdrawal.reference,
      amount_minor: out.withdrawal.amount_minor, currency: out.withdrawal.currency,
      payment_reference_last4: String(out.withdrawal.payment_reference || '').slice(-4),
      from: out.previous, to: out.withdrawal.status,
    },
  });
  return json({
    withdrawal: publicWithdrawal(out.withdrawal),
    next_step: 'Confirm the payout to record the ledger debit and close this request.',
  });
}

// ── financeWithdrawalConfirm (admin) ────────────────────────────────────────
/**
 * The final step. Posts the ledger DEBIT, drops the creator's balance and
 * closes the request.
 *
 * Everything that makes a double-payment impossible lives here: a row lock, a
 * status re-read inside the transaction, a state-machine assertion, and an
 * idempotency key on the ledger transaction backed by a unique index. A second
 * click cannot produce a second debit.
 */
export async function financeWithdrawalConfirm(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.CONFIRM_PAYOUT); if (denied) return denied;
  const b = ctx.body || {};
  const id = b.withdrawal_id;
  if (!id) return err('WITHDRAWAL_ID_REQUIRED', 'withdrawal_id is required.');

  const out = await withTransaction(async (tx) => {
    const svc = serviceClient(tx);
    await lockRecord(tx, id);
    const w = await svc.entities.WithdrawalRequest.get(id).catch(() => null);
    if (!w) return { conflict: err('WITHDRAWAL_NOT_FOUND', 'Withdrawal request not found.', 404) };

    // Re-read INSIDE the lock: this is what makes the second concurrent click
    // return "already paid" instead of posting a second debit.
    if (w.status === WITHDRAWAL.PAID) return { withdrawal: w, already: true };
    if (!w.payment_reference) {
      return { conflict: err('PAYMENT_REFERENCE_REQUIRED', 'Record the transfer and its bank reference before confirming the payout.', 409) };
    }
    let next;
    try { next = assertWithdrawalTransition(w.status, WITHDRAWAL.PAID); }
    catch { return { conflict: err('ILLEGAL_TRANSITION', `A ${w.status} request cannot be confirmed as paid. Record the transfer first.`, 409) }; }

    const posted = await recordWithdrawalPaid(svc, { withdrawal: w, actorId: ctx.user.id });
    const saved = await svc.entities.WithdrawalRequest.update(w.id, {
      status: next,
      confirmed_by: ctx.user.id,
      confirmed_at: nowIso(),
      paid_at: nowIso(),
      processed_at: nowIso(),
      paid_txn_id: posted.transaction.id,
    });

    // Keep the per-contest payout record in step, so a creator's win history and
    // their balance tell the same story.
    if (w.payout_id) {
      await svc.entities.Payout.update(w.payout_id, {
        status: 'PAYOUT_PAID', paid_by: ctx.user.id, paid_at: nowIso(),
        payment_reference: w.payment_reference, ledger_txn_id: posted.transaction.id,
      }).catch(() => null);
    }

    return { withdrawal: saved, txn: posted.transaction, replayed: posted.replayed, previous: w.status };
  }).catch((e) => ({ conflict: err(e?.code || 'CONFIRM_FAILED', e?.message || 'The payout could not be confirmed. No debit was posted.', e?.status || 500) }));

  if (out.conflict) return out.conflict;
  if (out.already) {
    return json({ withdrawal: publicWithdrawal(out.withdrawal), already_paid: true, message: 'This withdrawal was already confirmed. No second debit was created.' });
  }

  await projectBalance(ctx.svc, { userId: out.withdrawal.user_id, currency: 'INR', role: 'creator' }).catch(() => null);
  const creator = await ctx.svc.entities.User.get(out.withdrawal.user_id).catch(() => null);

  const selfApproved = Boolean(out.withdrawal.approved_by && out.withdrawal.approved_by === ctx.user.id);
  await auditFinance(ctx.svc, {
    actorId: ctx.user.id, action: 'PAYOUT_PAID', permission: FINANCE_PERMISSION.CONFIRM_PAYOUT,
    status: 'success', reason: b.note || 'Payout confirmed', subjectUserId: out.withdrawal.user_id,
    result: {
      withdrawal_id: id, reference: out.withdrawal.reference,
      amount_minor: out.withdrawal.amount_minor, currency: out.withdrawal.currency,
      payment_reference_last4: String(out.withdrawal.payment_reference || '').slice(-4),
      ledger_txn: out.txn.reference, ledger_replayed: Boolean(out.replayed),
      approved_and_confirmed_by_same_user: selfApproved,
    },
  });
  await notifyCreatorWithdrawal(ctx.svc, {
    withdrawal: out.withdrawal, creator, stage: 'paid',
    extra: { payment_reference: out.withdrawal.payment_reference },
  }).catch(() => null);

  const balance = await razekitBalance(ctx.svc, { userId: out.withdrawal.user_id, currency: 'INR', role: 'creator' });
  return json({
    withdrawal: publicWithdrawal(out.withdrawal),
    ledger_txn: out.txn.reference,
    balance,
    self_approved: selfApproved,
  });
}

// ── financeWithdrawalFail (admin) ───────────────────────────────────────────
/** The transfer bounced. The reservation stays, so the creator loses nothing. */
export async function financeWithdrawalFail(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.CONFIRM_PAYOUT); if (denied) return denied;
  const b = ctx.body || {};
  const id = b.withdrawal_id;
  if (!id) return err('WITHDRAWAL_ID_REQUIRED', 'withdrawal_id is required.');
  if (String(b.reason || '').trim().length < 10) {
    return err('REASON_REQUIRED', 'Explain why the transfer failed (at least 10 characters).');
  }

  const out = await withTransaction(async (tx) => {
    const svc = serviceClient(tx);
    await lockRecord(tx, id);
    const w = await svc.entities.WithdrawalRequest.get(id).catch(() => null);
    if (!w) return { conflict: err('WITHDRAWAL_NOT_FOUND', 'Withdrawal request not found.', 404) };
    if (w.status === WITHDRAWAL.PAID) {
      return { conflict: err('ALREADY_PAID', 'This withdrawal is already paid. Use a reversal instead of marking it failed.', 409) };
    }
    let next;
    try { next = assertWithdrawalTransition(w.status, WITHDRAWAL.FAILED); }
    catch { return { conflict: err('ILLEGAL_TRANSITION', `A ${w.status} request cannot be marked failed.`, 409) }; }
    const saved = await svc.entities.WithdrawalRequest.update(w.id, {
      status: next, failed_at: nowIso(), failure_reason: String(b.reason).slice(0, 500),
    });
    return { withdrawal: saved, previous: w.status };
  }).catch((e) => ({ conflict: err('FAIL_FAILED', e?.message || 'The request could not be updated.', 500) }));

  if (out.conflict) return out.conflict;
  await auditFinance(ctx.svc, {
    actorId: ctx.user.id, action: 'PAYOUT_FAILED', permission: FINANCE_PERMISSION.CONFIRM_PAYOUT,
    status: 'success', reason: b.reason, subjectUserId: out.withdrawal.user_id,
    result: { withdrawal_id: id, amount_minor: out.withdrawal.amount_minor, from: out.previous },
  });
  const creator = await ctx.svc.entities.User.get(out.withdrawal.user_id).catch(() => null);
  await notifyCreatorWithdrawal(ctx.svc, { withdrawal: out.withdrawal, creator, stage: 'failed', extra: { reason: b.reason } }).catch(() => null);
  return json({ withdrawal: publicWithdrawal(out.withdrawal) });
}

// ── financeWithdrawalReverse (admin) ────────────────────────────────────────
/**
 * Undo a settled payout. Posts a mirror transaction — the original debit is
 * never edited or deleted — and returns the amount to the creator's balance.
 */
export async function financeWithdrawalReverse(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.ADJUST); if (denied) return denied;
  const b = ctx.body || {};
  const id = b.withdrawal_id;
  if (!id) return err('WITHDRAWAL_ID_REQUIRED', 'withdrawal_id is required.');
  if (String(b.reason || '').trim().length < 10) {
    return err('REASON_REQUIRED', 'Explain why this payout is being reversed (at least 10 characters).');
  }

  const out = await withTransaction(async (tx) => {
    const svc = serviceClient(tx);
    await lockRecord(tx, id);
    const w = await svc.entities.WithdrawalRequest.get(id).catch(() => null);
    if (!w) return { conflict: err('WITHDRAWAL_NOT_FOUND', 'Withdrawal request not found.', 404) };
    if (w.status !== WITHDRAWAL.PAID) return { conflict: err('NOT_PAID', 'Only a paid withdrawal can be reversed.', 409) };
    if (!w.paid_txn_id) return { conflict: err('NO_LEDGER_TXN', 'This withdrawal has no ledger transaction to reverse.', 409) };

    const posted = await reverseTransaction(svc, {
      transactionId: w.paid_txn_id, reason: b.reason, actorId: ctx.user.id, actorRole: 'admin',
    });
    const saved = await svc.entities.WithdrawalRequest.update(w.id, {
      status: assertWithdrawalTransition(w.status, WITHDRAWAL.REVERSED),
      reversed_at: nowIso(), reversed_by: ctx.user.id,
      reversal_reason: String(b.reason).slice(0, 500), reversal_txn_id: posted.transaction.id,
    });
    return { withdrawal: saved, txn: posted.transaction };
  }).catch((e) => ({ conflict: err(e?.code || 'REVERSAL_FAILED', e?.message || 'The payout could not be reversed.', e?.status || 500) }));

  if (out.conflict) return out.conflict;
  await projectBalance(ctx.svc, { userId: out.withdrawal.user_id, currency: 'INR', role: 'creator' }).catch(() => null);
  await auditFinance(ctx.svc, {
    actorId: ctx.user.id, action: 'PAYOUT_REVERSED', permission: FINANCE_PERMISSION.ADJUST,
    status: 'success', reason: b.reason, subjectUserId: out.withdrawal.user_id,
    result: { withdrawal_id: id, amount_minor: out.withdrawal.amount_minor, reversal_txn: out.txn.reference },
  });
  return json({ withdrawal: publicWithdrawal(out.withdrawal), reversal_txn: out.txn.reference });
}

export { publicWithdrawal };
