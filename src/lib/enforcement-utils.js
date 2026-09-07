import { base44 } from '@/api/base44Client';
import { warningLimit, CLIENT_BLOCKED_ACTIONS, CREATOR_BLOCKED_ACTIONS } from './enforcement-config';

export async function getAccountStanding(userId) {
  const list = await base44.entities.AccountStanding.filter({ user_id: userId }, '-created_date', 1).catch(() => []);
  return list[0] || null;
}

/**
 * Client-side enforcement gate. Reads the server-authoritative AccountStanding
 * (admin-only writes) and decides whether the current user may perform an action.
 * NOTE: hard server-side blocking of the underlying entity create requires a backend
 * function (Builder+); the standing record itself cannot be self-edited, so a user
 * cannot un-suspend themselves or reduce their warning count.
 */
export async function canPerformAction(user, action) {
  if (!user) return { ok: true };
  if (user.role === 'admin' && !user.user_role) return { ok: true };
  const standing = await getAccountStanding(user.id);
  if (!standing) return { ok: true };
  const status = standing.status || 'active';
  if (status === 'terminated') return { ok: false, reason: 'Your account has been terminated.', status };
  if (status === 'suspended') {
    return { ok: false, reason: `Your account is suspended — "${action}" is unavailable.`, status };
  }
  if (status === 'restricted') {
    let ra = []; try { ra = JSON.parse(standing.restricted_actions || '[]'); } catch {}
    if (ra.includes(action)) return { ok: false, reason: `This action ("${action}") is restricted on your account.`, status };
  }
  return { ok: true, status };
}

// Issue a warning after a VERIFIED violation. Runs in the admin's auth context
// (only admins can create Warnings / update Standing / advance Reports).
export async function issueWarning({ adminUser, targetUser, report, violationType, severity, reason }) {
  const role = targetUser?.user_role || 'editor';
  let standing = await getAccountStanding(targetUser.id);
  if (!standing) {
    standing = await base44.entities.AccountStanding.create({
      user_id: targetUser.id, role, status: 'active', warning_count: 0, restricted_actions: '[]',
    });
  }
  const warningNumber = (standing.warning_count || 0) + 1;
  const limit = warningLimit(role);
  let newStatus = 'warning';
  if (warningNumber >= limit) newStatus = 'suspended';
  if (severity === 'critical' && warningNumber >= limit) newStatus = 'terminated';

  const warning = await base44.entities.Warning.create({
    user_id: targetUser.id, role, warning_number: warningNumber,
    violation_type: violationType, reason: reason || violationType,
    related_report_id: report?.id || '', severity: severity || 'medium',
    issued_by: adminUser?.id || 'system', status: 'active',
  });

  const restrictedActions = newStatus === 'suspended' || newStatus === 'terminated'
    ? JSON.stringify(role === 'client' ? CLIENT_BLOCKED_ACTIONS : CREATOR_BLOCKED_ACTIONS)
    : (standing.restricted_actions || '[]');

  standing = await base44.entities.AccountStanding.update(standing.id, {
    warning_count: warningNumber, status: newStatus,
    restricted_actions: restrictedActions,
    updated_by: adminUser?.id || 'system', last_updated: new Date().toISOString(),
  });

  if (report?.id) {
    await base44.entities.Report.update(report.id, {
      status: 'action_taken', reviewed_by: adminUser?.id || 'system',
      resolution: `Warning #${warningNumber} issued — account ${newStatus}`,
      related_warning_id: warning.id,
    }).catch(() => {});
  }

  const nType = newStatus === 'terminated' ? 'account_terminated'
    : newStatus === 'suspended' ? 'account_suspended'
    : newStatus === 'restricted' ? 'account_restricted' : 'account_warning';
  let nTitle, nDesc;
  if (newStatus === 'suspended') { nTitle = 'Your account has been suspended.'; nDesc = 'Some features are unavailable. You can appeal this decision.'; }
  else if (newStatus === 'terminated') { nTitle = 'Your account has been terminated.'; nDesc = 'Your account is no longer active.'; }
  else if (newStatus === 'restricted') {
    nTitle = 'Your account has been restricted.';
    const acts = JSON.parse(restrictedActions || '[]').map((a) => ({
      create_context: 'creating contexts', fund_context: 'funding contexts', manage_context: 'managing contexts',
      invite_creator: 'inviting creators', join_context: 'joining contexts', submit_work: 'submitting work',
      request_footage: 'requesting footage', new_withdrawal: 'new withdrawals',
    }[a] || a)).filter(Boolean);
    nDesc = acts.length ? `The following are currently unavailable: ${acts.join(', ')}.` : 'Some features are currently unavailable.';
  } else { nTitle = 'Your account received a policy warning.'; nDesc = reason || 'A verified policy violation was found.'; }
  await base44.entities.Notification.create({
    type: nType, recipient_user_id: targetUser.id, actor_user_id: adminUser?.id || '',
    actor_name: 'Platform Trust & Safety', title: nTitle, description: nDesc,
  }).catch(() => {});

  await base44.entities.AuditLog.create({
    user_id: targetUser.id,
    action: newStatus === 'suspended' ? 'account_suspended' : newStatus === 'terminated' ? 'account_terminated' : 'warning_issued',
    actor: adminUser?.id || 'system', reason: reason || violationType,
    related_report_id: report?.id || '', related_warning_id: warning.id,
    result: `warning #${warningNumber}; status=${newStatus}`,
  }).catch(() => {});

  return { warning, standing, status: newStatus };
}

export async function dismissReport({ adminUser, report, outcome = 'dismissed', reason }) {
  if (!report) return;
  await base44.entities.Report.update(report.id, {
    status: outcome, reviewed_by: adminUser?.id || 'system', resolution: reason || outcome,
  }).catch(() => {});
  await base44.entities.Notification.create({
    type: 'report_update', recipient_user_id: report.reporter_id, actor_user_id: adminUser?.id || '',
    actor_name: 'Platform Trust & Safety', title: 'Your report has been reviewed',
    description: outcome === 'verified_violation'
      ? 'Action was taken based on your report. Thank you for keeping the community safe.'
      : 'Your report was reviewed. No violation was found at this time.',
  }).catch(() => {});
  await base44.entities.AuditLog.create({
    user_id: report.reporter_id, action: 'report_reviewed',
    actor: adminUser?.id || 'system', reason: reason || outcome, related_report_id: report.id, result: outcome,
  }).catch(() => {});
}

export async function reverseEnforcement({ adminUser, warning, reason }) {
  if (!warning) return;
  await base44.entities.Warning.update(warning.id, { status: 'reversed' }).catch(() => {});
  const standing = await getAccountStanding(warning.user_id);
  if (standing) {
    const newCount = Math.max(0, (standing.warning_count || 0) - 1);
    const limit = warningLimit(standing.role);
    let newStatus = 'active';
    if (newCount > 0 && newCount < limit) newStatus = 'warning';
    await base44.entities.AccountStanding.update(standing.id, {
      warning_count: newCount, status: newStatus, restricted_actions: '[]',
      updated_by: adminUser?.id || 'system', last_updated: new Date().toISOString(),
    }).catch(() => {});
  }
  await base44.entities.Notification.create({
    type: 'report_update', recipient_user_id: warning.user_id, actor_user_id: adminUser?.id || '',
    actor_name: 'Platform Trust & Safety', title: 'A warning has been reversed',
    description: reason || 'A previously issued warning has been reversed after review.',
  }).catch(() => {});
  await base44.entities.AuditLog.create({
    user_id: warning.user_id, action: 'warning_reversed', actor: adminUser?.id || 'system',
    reason: reason || '', related_warning_id: warning.id, result: 'reversed',
  }).catch(() => {});
}

// Optional AI triage suggestion — never makes an irreversible decision.
export async function aiSuggestCategory(report) {
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You are a moderation triage assistant. Given a user report, suggest the most likely category and severity.\nCategories: spam, harassment, fraud, copyright, misleading, inappropriate, platform_abuse, payment_abuse, footage_misuse, fake_account, other.\nSeverity: low, medium, high, critical.\nReport category: ${report.category}\nReason: ${report.reason}\nRespond in JSON: {"category":"...","severity":"...","duplicate_risk":"low|medium|high"}`,
    response_json_schema: { type: 'object', properties: { category: { type: 'string' }, severity: { type: 'string' }, duplicate_risk: { type: 'string' } } },
  });
  return res;
}

export async function fileReport({ user, targetType, targetId, reportedUserId, category, severity, reason, evidenceUrl }) {
  await base44.entities.AuditLog.create({
    user_id: user.id, action: 'report_created', actor: 'self', reason: `${targetType}:${category}`, result: targetType,
  }).catch(() => {});
  return base44.entities.Report.create({
    reporter_id: user.id, target_type: targetType, target_id: targetId,
    reported_user_id: reportedUserId || '', category, severity: severity || 'medium',
    reason: (reason || '').trim(), evidence_url: evidenceUrl || '', status: 'submitted',
  });
}

export async function appealWarning({ user, warning, reason, evidenceUrl }) {
  const ticketId = `APL-${Date.now().toString(36).toUpperCase()}`;
  const ticket = await base44.entities.SupportTicket.create({
    user_id: user.id, user_name: user.full_name || user.email, user_email: user.email,
    user_role: user.user_role, category: 'dispute',
    subject: `Appeal — Warning #${warning.warning_number}`,
    description: reason, conversation_summary: `Appeal of warning ${warning.id} (${warning.violation_type}).`,
    ticket_id: ticketId, related_submission_id: '', related_transaction_id: '',
    priority: 'high', status: 'open', attachment_url: evidenceUrl || '',
  });
  await base44.entities.AuditLog.create({
    user_id: user.id, action: 'appeal_submitted', actor: 'self',
    reason: reason || '', related_warning_id: warning.id, result: ticketId,
  }).catch(() => {});
  return ticket;
}

export async function respondToAppeal({ adminUser, ticket, response, outcome = 'resolved' }) {
  await base44.entities.SupportTicket.update(ticket.id, { admin_response: response, status: outcome }).catch(() => {});
  await base44.entities.Notification.create({
    type: 'report_update', recipient_user_id: ticket.user_id, actor_user_id: adminUser?.id || '',
    actor_name: 'Platform Trust & Safety', title: 'Your appeal status has been updated.',
    description: response || 'Your appeal has been reviewed.',
  }).catch(() => {});
  await base44.entities.AuditLog.create({
    user_id: ticket.user_id, action: 'appeal_resolved', actor: adminUser?.id || 'system',
    reason: response || '', result: outcome,
  }).catch(() => {});
}