// @ts-nocheck
// Granular finance permissions.
//
// "Admin" is too blunt for money. The person who answers support tickets should
// be able to LOOK at a funding queue without being able to mark ₹50,000 as
// received, and the person who verifies transfers should not also be the one
// who approves the payout of the same money.
//
// Every finance permission is therefore a separate grant, recorded in
// AdminPermission with who granted it and when. Platform admins hold all of
// them implicitly — but the check still runs, still names the permission, and
// still writes an audit record, so the log says WHAT authority was used.
import { json } from '../functions/context.js';

export const FINANCE_PERMISSION = {
  /** Read the finance dashboard, queues, ledger and reconciliation. No writes. */
  VIEW: 'finance.view',
  /** Confirm that a reported bank transfer matches the bank statement. */
  VERIFY_FUNDING: 'finance.verify_funding',
  /** Open a withdrawal request and inspect the creator's history and holds. */
  REVIEW_WITHDRAWAL: 'finance.review_withdrawal',
  /** Approve a creator's withdrawal request for transfer. */
  APPROVE_WITHDRAWAL: 'finance.approve_withdrawal',
  /** Confirm a completed bank transfer. This is what posts the ledger DEBIT. */
  CONFIRM_PAYOUT: 'finance.confirm_payout',
  /**
   * Read unmasked financial data: a creator's full bank account number, a full
   * destination account. Separate from every other permission because seeing
   * account numbers and moving money are different jobs.
   */
  VIEW_SENSITIVE: 'finance.view_sensitive_financial_data',
  /** @deprecated alias of APPROVE_WITHDRAWAL, kept so existing grants still work. */
  APPROVE_PAYOUT: 'finance.approve_withdrawal',
  /** @deprecated alias of CONFIRM_PAYOUT. */
  RECORD_PAYOUT: 'finance.confirm_payout',
  /** Approve and record refunds to clients. */
  REFUND: 'finance.refund',
  /** Run and resolve reconciliation between RazeKit's ledger and the bank. */
  RECONCILE: 'finance.reconcile',
  /** Post a manual ledger adjustment. The most dangerous one. */
  ADJUST: 'finance.adjust',
  /** Grant or revoke the permissions above. */
  MANAGE: 'finance.manage_permissions',
};

// De-duplicated: the deprecated aliases point at the same permission strings.
export const ALL_FINANCE_PERMISSIONS = [...new Set(Object.values(FINANCE_PERMISSION))];

/**
 * Separation of duties. A permission listed here may not be exercised by the
 * same person who performed the paired action on the SAME record.
 *
 * This is advisory in a one-person beta — RazeKit currently has a single
 * operator — so it is reported rather than enforced as a hard block, and every
 * self-approval is flagged in the audit log for later review. Saying that
 * plainly is better than pretending a control exists that does not.
 */
export const SEGREGATION_PAIRS = [
  { first: FINANCE_PERMISSION.APPROVE_WITHDRAWAL, second: FINANCE_PERMISSION.CONFIRM_PAYOUT, note: 'Approving and confirming the same withdrawal' },
  { first: FINANCE_PERMISSION.VERIFY_FUNDING, second: FINANCE_PERMISSION.REFUND, note: 'Verifying and refunding the same funding' },
];

export async function permissionsFor(svc, user) {
  if (!user) return [];
  // A platform admin implicitly holds every finance permission.
  if (user.role === 'admin') return [...ALL_FINANCE_PERMISSIONS];
  const rows = await svc.entities.AdminPermission
    .filter({ user_id: user.id, active: true }, '-created_date', 100).catch(() => []);
  return rows
    .filter((r) => !r.revoked_at && ALL_FINANCE_PERMISSIONS.includes(r.permission))
    .map((r) => r.permission);
}

export async function hasPermission(svc, user, permission) {
  const held = await permissionsFor(svc, user);
  return held.includes(permission);
}

/**
 * Guard for a finance handler. Returns a response to send back, or null to
 * continue. The message names the missing permission so an operator can be
 * told exactly what to request instead of just "Forbidden".
 */
export async function requireFinance(ctx, permission) {
  const user = ctx.user;
  if (!user) return json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } }, 401);
  const ok = await hasPermission(ctx.svc, user, permission);
  if (!ok) {
    return json({
      error: {
        code: 'FINANCE_PERMISSION_REQUIRED',
        message: `This action requires the '${permission}' permission.`,
        permission,
      },
    }, 403);
  }
  return null;
}

/**
 * Append-only audit trail for finance actions.
 *
 * Written for every attempt, successful or not: a refused verification is
 * exactly the event an auditor most wants to see.
 */
export async function auditFinance(svc, {
  actorId, action, permission, status = 'success', reason = '',
  subjectUserId = null, result = {},
}) {
  return svc.entities.AuditLog.create({
    user_id: subjectUserId || actorId,
    actor: actorId,
    action,
    status,
    reason: String(reason || '').slice(0, 500),
    result: JSON.stringify({ permission, ...result }),
  }).catch(() => null);
}

/**
 * Did the same person perform both halves of a segregated pair on this record?
 * Reported to the admin UI and stamped on the audit record.
 */
export function selfApproval(record, actorId) {
  if (!actorId) return null;
  if (record.approved_by && record.approved_by === actorId && record.paid_by === actorId) {
    return 'approved_and_paid_by_same_user';
  }
  if (record.verified_by && record.refunded_by && record.verified_by === actorId && record.refunded_by === actorId) {
    return 'verified_and_refunded_by_same_user';
  }
  return null;
}

/** Grant a finance permission. Only a holder of finance.manage_permissions may call this. */
export async function grantPermission(svc, { userId, permission, grantedBy, note }) {
  if (!ALL_FINANCE_PERMISSIONS.includes(permission)) {
    const err = new Error('UNKNOWN_PERMISSION');
    err.status = 400;
    throw err;
  }
  const existing = await svc.entities.AdminPermission
    .filter({ user_id: userId, permission }, '-created_date', 1).catch(() => []);
  const patch = { active: true, granted_by: grantedBy, granted_at: new Date().toISOString(), revoked_at: null, revoked_by: null, note: note || '' };
  if (existing.length) return svc.entities.AdminPermission.update(existing[0].id, patch);
  return svc.entities.AdminPermission.create({ user_id: userId, permission, ...patch });
}

export async function revokePermission(svc, { userId, permission, revokedBy, note }) {
  const existing = await svc.entities.AdminPermission
    .filter({ user_id: userId, permission }, '-created_date', 1).catch(() => []);
  if (!existing.length) return null;
  return svc.entities.AdminPermission.update(existing[0].id, {
    active: false, revoked_by: revokedBy, revoked_at: new Date().toISOString(), note: note || '',
  });
}
