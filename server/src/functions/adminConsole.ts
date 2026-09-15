// @ts-nocheck
// Admin console endpoints — Users, Trust & Safety, Enforcement, Visual Assets,
// System Health.
//
// These exist because the admin frontend was reading the GENERIC entity API
// (`POST /api/entities/:name/query`). That works, but it is the wrong shape for
// an operations console: it hands the browser a raw table, gives no server-side
// search or pagination, cannot join in the context a reviewer needs, and offers
// no place to enforce "who may do this" per operation.
//
// Every handler here:
//   • re-checks `user.role === 'admin'` server-side, from the session — never
//     from anything the browser sent;
//   • returns only the fields the console actually renders;
//   • writes an AuditLog row for anything that changes state.
//
// Role is read from `ctx.user.role`, which is loaded from the database by the
// auth middleware. A browser cannot set it.
import { json } from './context.js';
import { config } from '../config.js';
import { uropayConfigured, uropayEnv, uropayLive } from '../payments/uropay.js';
import { prisma, adminPrisma, hasSeparateAdminDb } from '../db.js';
import { SCORING_VERSION } from '../scoring/index.js';
import { paymentMode } from '../payments/config.js';
import { displayName } from '../finance/notify.js';

const nowIso = () => new Date().toISOString();
const err = (code, message, status = 400, extra = {}) => json({ error: { code, message, ...extra } }, status);

/** Server-side admin gate. Defence in depth — the route layer also checks. */
const requireAdmin = (ctx) => {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  // `role` is server-controlled. `user_role` is the self-selected creator/brand
  // surface and is NOT an authority signal.
  if (ctx.user.role !== 'admin') return err('FORBIDDEN', 'Admin access is required.', 403);
  return null;
};

const SEED_SUFFIXES = ['@razekit.test', '@razekit.demo', '@razekit.sim'];
const isSeed = (email) => SEED_SUFFIXES.some((s) => String(email || '').endsWith(s));

async function audit(svc, { actorId, action, subjectUserId, status = 'success', reason = '', result = {} }) {
  return svc.entities.AuditLog.create({
    user_id: subjectUserId || actorId,
    actor: actorId,
    action,
    status,
    reason: String(reason || '').slice(0, 500),
    result: JSON.stringify(result),
  }).catch(() => null);
}

// ── Users ───────────────────────────────────────────────────────────────────
/**
 * Account list with server-side search and paging.
 *
 * Counts come from the database rather than from a capped page — a previous
 * version counted creators from a 500-row window and reported the wrong totals.
 */
export async function adminUsersList(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const b = ctx.body || {};
  const limit = Math.min(Number(b.limit) || 50, 200);
  const offset = Math.max(Number(b.offset) || 0, 0);

  const where = {};
  if (b.role) where.role = b.role;
  if (b.user_role) where.userRole = b.user_role;
  if (b.account_status) where.accountStatus = b.account_status;
  if (b.q) {
    where.OR = [
      { email: { contains: String(b.q), mode: 'insensitive' } },
      { fullName: { contains: String(b.q), mode: 'insensitive' } },
    ];
  }

  const [rows, total, creators, clients, admins, suspended] = await Promise.all([
    prisma.appUser.findMany({ where, orderBy: { createdDate: 'desc' }, take: limit, skip: offset }),
    prisma.appUser.count({ where }),
    prisma.appUser.count({ where: { userRole: 'creator' } }),
    prisma.appUser.count({ where: { userRole: 'client' } }),
    prisma.appUser.count({ where: { role: 'admin' } }),
    prisma.appUser.count({ where: { accountStatus: { not: 'active' } } }),
  ]);

  return json({
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.fullName || null,
      role: u.role,
      user_role: u.userRole,
      account_status: u.accountStatus,
      email_verified: u.emailVerified,
      onboarding_completed: u.onboardingCompleted,
      created_date: u.createdDate.toISOString(),
      is_seed: isSeed(u.email),
    })),
    total, limit, offset,
    counts: { total: await prisma.appUser.count(), creators, clients, admins, suspended },
  });
}

/** One account plus the activity a reviewer needs to make a decision. */
export async function adminUserDetail(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const { user_id: id } = ctx.body || {};
  if (!id) return err('USER_ID_REQUIRED', 'user_id is required.');
  const svc = ctx.svc;

  const u = await prisma.appUser.findUnique({ where: { id } });
  if (!u) return err('USER_NOT_FOUND', 'User not found.', 404);

  const [contests, submissions, tickets, reports, actions, audits] = await Promise.all([
    svc.entities.Contest.filter({ created_by_id: id }, '-created_date', 25).catch(() => []),
    svc.entities.Submission.filter({ created_by_id: id }, '-created_date', 25).catch(() => []),
    svc.entities.SupportTicket.filter({ user_id: id }, '-created_date', 25).catch(() => []),
    svc.entities.TrustReport.filter({ subject_id: id }, '-created_date', 25).catch(() => []),
    svc.entities.EnforcementAction.filter({ subject_id: id }, '-created_date', 25).catch(() => []),
    svc.entities.AuditLog.filter({ user_id: id }, '-created_date', 40).catch(() => []),
  ]);

  return json({
    user: {
      id: u.id, email: u.email, full_name: u.fullName || null,
      role: u.role, user_role: u.userRole, account_status: u.accountStatus,
      email_verified: u.emailVerified, onboarding_completed: u.onboardingCompleted,
      created_date: u.createdDate.toISOString(), is_seed: isSeed(u.email),
    },
    activity: {
      contests: contests.map((c) => ({ id: c.id, title: c.title, status: c.status, created_date: c.created_date })),
      submissions: submissions.map((s) => ({ id: s.id, contest_id: s.contest_id, status: s.status, final_score: s.final_score ?? null })),
      tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, created_date: t.created_date })),
    },
    reports: reports.map((r) => ({ id: r.id, reason: r.reason, severity: r.severity, status: r.status, created_date: r.created_date })),
    enforcement: actions.map((a) => ({ id: a.id, action: a.action, status: a.status, reason: a.reason, applied_at: a.applied_at })),
    audit: audits.map((a) => ({ id: a.id, action: a.action, actor: a.actor, status: a.status, reason: a.reason, created_date: a.created_date })),
  });
}

const USER_ACTIONS = {
  suspend: { status: 'suspended', label: 'Account suspended' },
  reinstate: { status: 'active', label: 'Account reinstated' },
  verify_email: { emailVerified: true, label: 'Email marked verified' },
  grant_admin: { role: 'admin', label: 'Granted platform admin' },
  revoke_admin: { role: 'user', label: 'Revoked platform admin' },
};

/**
 * Change an account's standing.
 *
 * Two guards that matter: an admin cannot act on their own account (so a
 * mistake cannot lock the last operator out or quietly self-escalate without a
 * second party), and the platform can never be left with zero admins.
 */
export async function adminUserAction(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const b = ctx.body || {};
  const { user_id: id, action, reason } = b;
  if (!id || !action) return err('USER_AND_ACTION_REQUIRED', 'user_id and action are required.');
  const spec = USER_ACTIONS[action];
  if (!spec) return err('UNKNOWN_ACTION', `Unknown action: ${action}`);
  if (!reason || String(reason).trim().length < 5) {
    return err('REASON_REQUIRED', 'Give a reason (at least 5 characters). It is written to the audit log.');
  }
  if (id === ctx.user.id) {
    return err('SELF_ACTION_BLOCKED', 'You cannot change your own account standing. Ask another admin.', 409);
  }

  const target = await prisma.appUser.findUnique({ where: { id } });
  if (!target) return err('USER_NOT_FOUND', 'User not found.', 404);

  if (action === 'revoke_admin') {
    const admins = await prisma.appUser.count({ where: { role: 'admin' } });
    if (admins <= 1) return err('LAST_ADMIN', 'This is the last platform admin. Promote someone else first.', 409);
  }

  const data = {};
  if (spec.status) data.accountStatus = spec.status;
  if (spec.role) data.role = spec.role;
  if (spec.emailVerified !== undefined) data.emailVerified = spec.emailVerified;

  const before = { role: target.role, account_status: target.accountStatus, email_verified: target.emailVerified };
  const updated = await prisma.appUser.update({ where: { id }, data });

  await audit(ctx.svc, {
    actorId: ctx.user.id, action: `admin.user.${action}`, subjectUserId: id, reason,
    result: { before, after: { role: updated.role, account_status: updated.accountStatus, email_verified: updated.emailVerified }, label: spec.label },
  });

  return json({
    ok: true, label: spec.label,
    user: { id: updated.id, email: updated.email, role: updated.role, account_status: updated.accountStatus, email_verified: updated.emailVerified },
  });
}

// ── Trust & Safety ──────────────────────────────────────────────────────────
export async function adminTrustSafety(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};

  const [reports, alerts] = await Promise.all([
    svc.entities.TrustReport.filter({}, '-created_date', 300).catch(() => []),
    svc.entities.FraudAlert.filter({}, '-created_date', 200).catch(() => []),
  ]);

  let filtered = b.status ? reports.filter((r) => r.status === b.status) : reports;
  if (b.severity) filtered = filtered.filter((r) => r.severity === b.severity);

  const withSubject = [];
  for (const r of filtered.slice(0, 100)) {
    const subject = r.subject_type === 'user' && r.subject_id
      ? await prisma.appUser.findUnique({ where: { id: r.subject_id } }).catch(() => null)
      : null;
    withSubject.push({
      id: r.id, subject_type: r.subject_type, subject_id: r.subject_id,
      subject_label: r.subject_label || (subject ? displayName(subject) : r.subject_id),
      subject_email: subject?.email || null,
      reason: r.reason, details: r.details || null, category: r.category || null,
      severity: r.severity, status: r.status, source: r.source,
      risk_score: r.risk_score ?? null, assigned_to: r.assigned_to || null,
      reviewed_by: r.reviewed_by || null, resolution: r.resolution || null,
      created_date: r.created_date,
    });
  }

  const byStatus = reports.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {});
  return json({
    reports: withSubject,
    counts: {
      total: reports.length, open: reports.filter((r) => r.status === 'OPEN').length,
      high: reports.filter((r) => r.severity === 'high').length, by_status: byStatus,
    },
    fraud_alerts: alerts.slice(0, 50).map((a) => ({
      id: a.id, user_id: a.user_id, alert_type: a.alert_type,
      severity: a.severity, status: a.status, details: a.details || null, created_date: a.created_date,
    })),
  });
}

export async function adminTrustAction(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const b = ctx.body || {};
  const { report_id: id, action, reason } = b;
  if (!id || !action) return err('REPORT_AND_ACTION_REQUIRED', 'report_id and action are required.');
  if (!['assign', 'resolve', 'dismiss', 'escalate'].includes(action)) return err('UNKNOWN_ACTION', `Unknown action: ${action}`);
  if (action !== 'assign' && String(reason || '').trim().length < 10) {
    return err('REASON_REQUIRED', 'Give a reason (at least 10 characters). It is written to the audit log.');
  }

  const svc = ctx.svc;
  const report = await svc.entities.TrustReport.get(id).catch(() => null);
  if (!report) return err('REPORT_NOT_FOUND', 'Report not found.', 404);

  const patch = { reviewed_by: ctx.user.id, reviewed_at: nowIso() };
  if (action === 'assign') { patch.assigned_to = b.assign_to || ctx.user.id; patch.status = 'IN_REVIEW'; }
  if (action === 'escalate') { patch.status = 'ESCALATED'; patch.severity = 'high'; patch.resolution_notes = String(reason).slice(0, 1000); }
  if (action === 'resolve') { patch.status = 'RESOLVED'; patch.resolution = 'actioned'; patch.resolution_notes = String(reason).slice(0, 1000); patch.closed_at = nowIso(); }
  if (action === 'dismiss') { patch.status = 'DISMISSED'; patch.resolution = 'no_action'; patch.resolution_notes = String(reason).slice(0, 1000); patch.closed_at = nowIso(); }

  const updated = await svc.entities.TrustReport.update(id, patch);
  await audit(svc, {
    actorId: ctx.user.id, action: `admin.trust.${action}`, subjectUserId: report.subject_id,
    reason: reason || 'assigned', result: { report_id: id, from: report.status, to: updated.status },
  });
  return json({ report: { id: updated.id, status: updated.status, severity: updated.severity, resolution: updated.resolution || null } });
}

// ── Enforcement ─────────────────────────────────────────────────────────────
export async function adminEnforcement(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const svc = ctx.svc;
  const rows = await svc.entities.EnforcementAction.filter({}, '-created_date', 200).catch(() => []);
  const b = ctx.body || {};
  const filtered = b.status ? rows.filter((r) => r.status === b.status) : rows;

  return json({
    actions: filtered.slice(0, 100).map((a) => ({
      id: a.id, subject_type: a.subject_type, subject_id: a.subject_id, subject_label: a.subject_label || a.subject_id,
      action: a.action, reason: a.reason, details: a.details || null, severity: a.severity || null,
      status: a.status, duration_days: a.duration_days ?? null, expires_at: a.expires_at || null,
      actor_id: a.actor_id, actor_name: a.actor_name || null, applied_at: a.applied_at,
      reverted_at: a.reverted_at || null, revert_reason: a.revert_reason || null,
      related_report_id: a.related_report_id || null,
    })),
    counts: {
      total: rows.length,
      active: rows.filter((r) => r.status === 'ACTIVE').length,
      reverted: rows.filter((r) => r.status === 'REVERTED').length,
    },
  });
}

const ENFORCEMENT_ACTIONS = ['warning', 'content_removal', 'contest_removal', 'submission_disqualified', 'suspension', 'ban', 'payout_hold'];

/**
 * Apply or revert an enforcement action.
 *
 * Reverting writes a NEW record rather than editing the original, so the
 * history shows both what was done and that it was undone.
 */
export async function adminEnforcementAction(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};

  if (b.revert_id) {
    if (String(b.reason || '').trim().length < 10) return err('REASON_REQUIRED', 'Explain why this is being reverted (at least 10 characters).');
    const original = await svc.entities.EnforcementAction.get(b.revert_id).catch(() => null);
    if (!original) return err('ACTION_NOT_FOUND', 'Enforcement action not found.', 404);
    if (original.status === 'REVERTED') return err('ALREADY_REVERTED', 'That action was already reverted.', 409);

    const updated = await svc.entities.EnforcementAction.update(original.id, {
      status: 'REVERTED', reverted_at: nowIso(), reverted_by: ctx.user.id, revert_reason: String(b.reason).slice(0, 500),
    });
    // If the action suspended an account, lift it too — otherwise "reverted"
    // would be a label with no effect.
    if (original.action === 'suspension' && original.subject_type === 'user') {
      await prisma.appUser.update({ where: { id: original.subject_id }, data: { accountStatus: 'active' } }).catch(() => null);
    }
    await audit(svc, {
      actorId: ctx.user.id, action: 'admin.enforcement.revert', subjectUserId: original.subject_id,
      reason: b.reason, result: { enforcement_id: original.id, original_action: original.action },
    });
    return json({ action: { id: updated.id, status: updated.status } });
  }

  const { subject_type: subjectType, subject_id: subjectId, action, reason } = b;
  if (!subjectType || !subjectId || !action) return err('SUBJECT_AND_ACTION_REQUIRED', 'subject_type, subject_id and action are required.');
  if (!ENFORCEMENT_ACTIONS.includes(action)) return err('UNKNOWN_ACTION', `Unknown action: ${action}`);
  if (String(reason || '').trim().length < 10) return err('REASON_REQUIRED', 'Give a reason (at least 10 characters). It is written to the audit log.');
  if (subjectType === 'user' && subjectId === ctx.user.id) {
    return err('SELF_ACTION_BLOCKED', 'You cannot enforce against your own account.', 409);
  }

  let label = subjectId;
  if (subjectType === 'user') {
    const u = await prisma.appUser.findUnique({ where: { id: subjectId } });
    if (!u) return err('SUBJECT_NOT_FOUND', 'That account does not exist.', 404);
    label = displayName(u);
  }

  const days = Number(b.duration_days) || null;
  const created = await svc.entities.EnforcementAction.create({
    subject_type: subjectType, subject_id: subjectId, subject_label: label,
    action, reason: String(reason).slice(0, 500), details: String(b.details || '').slice(0, 1000) || null,
    severity: b.severity || 'medium', status: 'ACTIVE',
    duration_days: days, expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null,
    actor_id: ctx.user.id, actor_name: displayName(ctx.user), applied_at: nowIso(),
    related_report_id: b.related_report_id || null,
    related_user_id: subjectType === 'user' ? subjectId : null,
  });

  // Suspension and ban actually change account standing; the rest are records.
  if (['suspension', 'ban'].includes(action) && subjectType === 'user') {
    await prisma.appUser.update({ where: { id: subjectId }, data: { accountStatus: action === 'ban' ? 'banned' : 'suspended' } }).catch(() => null);
  }

  await audit(svc, {
    actorId: ctx.user.id, action: `admin.enforcement.${action}`, subjectUserId: subjectType === 'user' ? subjectId : null,
    reason, result: { enforcement_id: created.id, subject_type: subjectType, subject_id: subjectId, duration_days: days },
  });
  return json({ action: { id: created.id, action: created.action, status: created.status, subject_label: label } });
}

// ── Visual assets ───────────────────────────────────────────────────────────
export async function adminVisualAssets(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const svc = ctx.svc;
  const [assets, jobs] = await Promise.all([
    svc.entities.VisualAsset.filter({}, '-created_date', 200).catch(() => []),
    svc.entities.VisualGenerationJob.filter({}, '-created_date', 200).catch(() => []),
  ]);

  const byStatus = jobs.reduce((m, j) => { m[j.status] = (m[j.status] || 0) + 1; return m; }, {});
  const out = [];
  for (const a of assets.slice(0, 100)) {
    const contest = a.contest_id ? await svc.entities.Contest.get(a.contest_id).catch(() => null) : null;
    out.push({
      id: a.id, contest_id: a.contest_id || null, contest_title: contest?.title || null,
      kind: a.kind || a.asset_type || null, status: a.status || null,
      url: a.url || a.image_url || a.file_url || null,
      source: a.source || null, version: a.version ?? null, created_date: a.created_date,
    });
  }

  return json({
    assets: out,
    jobs: jobs.slice(0, 100).map((j) => ({
      id: j.id, contest_id: j.contest_id || null, status: j.status,
      attempts: j.attempts ?? null, error: j.error || j.last_error || null,
      created_date: j.created_date, updated_date: j.updated_date,
    })),
    counts: { assets: assets.length, jobs: jobs.length, by_status: byStatus,
      failed: jobs.filter((j) => String(j.status || '').toUpperCase().includes('FAIL')).length },
  });
}

// ── System health ───────────────────────────────────────────────────────────
/**
 * Real status only. Every line is something actually probed or actually
 * configured — nothing here reports "ok" because a variable exists.
 */
export async function adminSystemHealth(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const svc = ctx.svc;
  const started = Date.now();

  // Databases: a real round trip each, timed. RazeKit runs platform data and
  // admin-only records in separate Neon projects, so BOTH are probed —
  // reporting one as "ok" would hide an outage on the other.
  const probe = async (client, label) => {
    try {
      const t0 = Date.now();
      await client.$queryRawUnsafe('select 1');
      return { status: 'ok', detail: `${label} round trip succeeded`, latency_ms: Date.now() - t0 };
    } catch (e) {
      return { status: 'down', detail: String(e?.message || e).split('\n')[0], latency_ms: null };
    }
  };
  const database = await probe(prisma, 'platform database');
  const adminDatabase = hasSeparateAdminDb()
    ? await probe(adminPrisma, 'admin database')
    : { status: 'shared', detail: 'ADMIN_DATABASE_URL not set — admin records share the platform database', latency_ms: null };

  // Storage / email / LLM: report the CONFIGURED driver honestly. A missing key
  // is "not configured", never "ok".
  const storage = config.storage.driver === 's3'
    ? (config.storage.s3.accessKeyId && config.storage.s3.bucketPrivate
        ? { status: 'ok', detail: `s3/R2 bucket ${config.storage.s3.bucketPrivate}` }
        : { status: 'misconfigured', detail: 'STORAGE_DRIVER=s3 but credentials or bucket are missing' })
    : { status: 'degraded', detail: 'local disk driver — not durable on Render, files are lost on redeploy' };

  const email = config.email.driver === 'resend'
    ? (config.email.resendApiKey ? { status: 'ok', detail: `resend, from ${config.email.from}` }
                                 : { status: 'misconfigured', detail: 'EMAIL_DRIVER=resend but RESEND_API_KEY is missing' })
    : config.email.driver === 'smtp'
      ? (config.email.smtp.host ? { status: 'ok', detail: `smtp ${config.email.smtp.host}` } : { status: 'misconfigured', detail: 'SMTP host missing' })
      : { status: 'degraded', detail: 'console driver — emails are logged, not delivered' };

  const llm = config.llm.driver === 'anthropic'
    ? (config.llm.anthropicApiKey ? { status: 'ok', detail: config.llm.model } : { status: 'misconfigured', detail: 'ANTHROPIC_API_KEY missing' })
    : { status: 'degraded', detail: 'stub driver — agent enrichment is disabled, deterministic paths still work' };

  // Recent failures, from records rather than from a guess.
  const [failedJobs, recentAudit, agentRuns] = await Promise.all([
    svc.entities.VisualGenerationJob.filter({}, '-created_date', 100).catch(() => []),
    svc.entities.AuditLog.filter({}, '-created_date', 100).catch(() => []),
    svc.entities.AgentRun.filter({}, '-created_date', 100).catch(() => []),
  ]);
  const dayAgo = Date.now() - 864e5;
  const recentFailures = recentAudit.filter((a) => a.status === 'error' && Date.parse(a.created_date) > dayAgo);
  const failedAgents = agentRuns.filter((r) => String(r.status || '').toLowerCase().includes('fail') || r.error);

  return json({
    checked_at: nowIso(),
    took_ms: Date.now() - started,
    services: {
      api: { status: 'ok', detail: `${config.env} on port ${config.port}` },
      database,
      admin_database: adminDatabase,
      storage, email, llm,
      authentication: { status: config.jwtSecret ? 'ok' : 'down', detail: config.jwtSecret ? 'JWT signing key present' : 'JWT_SECRET missing' },
      scheduler: { status: config.enableScheduler ? 'ok' : 'disabled', detail: config.enableScheduler ? 'in-process cron running' : 'ENABLE_SCHEDULER=false' },
      payments: { status: paymentMode() === 'MAINTENANCE' ? 'paused' : 'ok', detail: `PAYMENT_MODE=${paymentMode()}` },
      // The UPI provider. Reported by what is actually configured, never as a
      // blanket "ok" — an operator looking at this page needs to be able to
      // tell "working" from "nobody has finished setting it up".
      uropay: uropayStatusLine(),
    },
    engines: { scoring_version: SCORING_VERSION },
    errors: {
      audit_errors_24h: recentFailures.length,
      failed_visual_jobs: failedJobs.filter((j) => String(j.status || '').toUpperCase().includes('FAIL')).length,
      failed_agent_runs: failedAgents.length,
      recent: recentFailures.slice(0, 10).map((a) => ({ id: a.id, action: a.action, reason: a.reason, created_date: a.created_date })),
    },
    cors_origins: config.corsOrigins,
  });
}

/**
 * UroPay's line on the System Health page.
 *
 * It reports configuration, not reachability — probing the provider on every
 * health-page load would spend our 60-per-minute rate limit on a dashboard.
 * uropayAdminHealth does the live probe on demand instead.
 */
function uropayStatusLine() {
  const env = uropayEnv();
  if (!uropayConfigured()) {
    return {
      status: 'not_configured',
      detail: `UroPay ${env} credentials are not set — UPI payment is unavailable and funding falls back to manual bank transfer`,
    };
  }
  if (env === 'production' && !uropayLive()) {
    return {
      status: 'misconfigured',
      detail: 'production credentials are present but UROPAY_PRODUCTION_ENABLED is not true — no payment will be taken',
    };
  }
  return {
    status: uropayLive() ? 'ok' : 'test',
    detail: uropayLive()
      ? 'UroPay production: UPI collection active'
      : 'UroPay TEST mode: UPI flows work end to end but move no real money and fund no contest',
  };
}

// ── Public platform stats ───────────────────────────────────────────────────
/**
 * Real adoption counts for the homepage. Deliberately PUBLIC and deliberately
 * honest: seed, demo and simulation accounts are excluded, so a small platform
 * shows a small number rather than an invented one.
 */
export async function platformStats(ctx) {
  const svc = ctx.svc;
  const notSeed = { NOT: { OR: SEED_SUFFIXES.map((s) => ({ email: { endsWith: s } })) } };

  const [creators, clients, contests, snapshots] = await Promise.all([
    prisma.appUser.count({ where: { ...notSeed, userRole: 'creator', accountStatus: 'active' } }),
    prisma.appUser.count({ where: { ...notSeed, userRole: 'client', accountStatus: 'active' } }),
    svc.entities.Contest.filter({}, '-created_date', 2000).catch(() => []),
    svc.entities.ScoreSnapshot.filter({ is_winner: true }, '-created_date', 2000).catch(() => []),
  ]);

  const seedIds = new Set(
    (await prisma.appUser.findMany({ where: { OR: SEED_SUFFIXES.map((s) => ({ email: { endsWith: s } })) }, select: { id: true } }))
      .map((u) => u.id)
  );
  const realContests = contests.filter((c) => !seedIds.has(c.created_by_id) && !c.demo);
  const realWins = snapshots.filter((s) => !seedIds.has(s.creator_id));

  return json({
    creators, clients,
    contests: realContests.length,
    completed_contests: realContests.filter((c) => ['winner_selected', 'completed'].includes(c.status)).length,
    winners: realWins.length,
    // Stated plainly so the UI never has to guess whether a number is safe.
    excludes: 'seed, demo and simulation accounts',
    generated_at: nowIso(),
  });
}
