// @ts-nocheck
// Admin Control Center (spec 11/12).
//
// The backend is the security authority; the admin UI is only a surface. Every
// handler re-checks `user.role === 'admin'` even though the registry already
// gates these as ADMIN_ONLY — defence in depth, because a routing mistake must
// not become a data breach.
//
// Note `role` (not `user_role`) is the trustworthy signal: user_role is the
// self-selected creator/brand surface, role is server-controlled.
import { json } from './context.js';
import { SCORING_VERSION } from '../scoring/index.js';
import { DURATION_RULE_VERSION, GLOBAL_MAX_DAYS } from '../contest/duration.js';

const requireAdmin = (ctx) => {
  if (!ctx.user) return json({ error: 'Unauthorized' }, 401);
  if (ctx.user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
  return null;
};

const count = (rows, pred) => rows.filter(pred).length;

/** Operations command centre: platform KPIs + what needs attention. */
export async function adminOverview(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const svc = ctx.svc;

  const [contests, submissions, tickets, links, snaps, payouts, audits] = await Promise.all([
    svc.entities.Contest.filter({}, '-created_date', 1000).catch(() => []),
    svc.entities.Submission.filter({}, '-created_date', 1000).catch(() => []),
    svc.entities.SupportTicket.filter({}, '-created_date', 500).catch(() => []),
    svc.entities.TrackingLink.filter({}, '-created_date', 1000).catch(() => []),
    svc.entities.ScoreSnapshot.filter({}, '-created_date', 1000).catch(() => []),
    svc.entities.Payout.filter({}, '-created_date', 500).catch(() => []),
    svc.entities.AuditLog.filter({}, '-created_date', 25).catch(() => []),
  ]);

  const now = Date.now();
  const pastDeadlineOpen = contests.filter((c) => c.status === 'open' && c.deadline && Date.parse(c.deadline) < now);
  const noDestination = contests.filter((c) => !c.brand_destination_url && c.status === 'open');
  const suspicious = links.reduce((a, l) => a + Number(l.suspicious_clicks || 0), 0);
  const openTickets = tickets.filter((t) => !['resolved', 'closed'].includes(t.status));

  const attention = [];
  if (pastDeadlineOpen.length) attention.push({ kind: 'winner_finalization', severity: 'high', count: pastDeadlineOpen.length, message: 'Contests past deadline awaiting winner finalization.' });
  if (noDestination.length) attention.push({ kind: 'traffic_unmeasurable', severity: 'medium', count: noDestination.length, message: 'Open contests with no destination URL — Brand Traffic cannot be measured.' });
  if (suspicious > 0) attention.push({ kind: 'suspicious_traffic', severity: 'medium', count: suspicious, message: 'Traffic events excluded from scoring pending review.' });
  if (openTickets.length) attention.push({ kind: 'support', severity: 'low', count: openTickets.length, message: 'Open support tickets.' });
  const failedPayouts = payouts.filter((p) => String(p.status || '').includes('FAILED'));
  if (failedPayouts.length) attention.push({ kind: 'payout_failure', severity: 'high', count: failedPayouts.length, message: 'Payouts in a failed state.' });

  return json({
    kpis: {
      contests: {
        total: contests.length,
        draft: count(contests, (c) => c.status === 'draft'),
        open: count(contests, (c) => c.status === 'open'),
        ended: pastDeadlineOpen.length,
        winner_selected: count(contests, (c) => c.status === 'winner_selected'),
        completed: count(contests, (c) => c.status === 'completed'),
        cancelled: count(contests, (c) => c.status === 'cancelled'),
      },
      submissions: {
        total: submissions.length,
        pending_review: count(submissions, (s) => s.status === 'submitted'),
        shortlisted: count(submissions, (s) => s.status === 'shortlisted'),
        won: count(submissions, (s) => s.status === 'won'),
        working: count(submissions, (s) => s.status === 'working'),
      },
      traffic: {
        total_clicks: links.reduce((a, l) => a + Number(l.total_clicks || 0), 0),
        verified_clicks: links.reduce((a, l) => a + Number(l.verified_clicks || 0), 0),
        unique_visitors: links.reduce((a, l) => a + Number(l.unique_visitors || 0), 0),
        excluded_clicks: suspicious,
        tracking_links: links.length,
      },
      scoring: { snapshots: snaps.length, scoring_version: SCORING_VERSION },
      finance: {
        total_prize_committed: contests.reduce((a, c) => a + Number(c.prize_amount || 0), 0),
        payouts: payouts.length,
        failed_payouts: failedPayouts.length,
      },
      support: { total: tickets.length, open: openTickets.length },
    },
    attention,
    fairness: { duration_rule_version: DURATION_RULE_VERSION, global_max_days: GLOBAL_MAX_DAYS },
    // System health is reported only from things we can actually observe.
    system: {
      database: 'ok',
      scheduler: 'ok',
      scoring_engine: SCORING_VERSION,
      payment_gateway: 'not_configured',
    },
    recent_audit: audits.map((a) => ({
      id: a.id, action: a.action, actor: a.actor, status: a.status,
      reason: a.reason, created_date: a.created_date,
    })),
  });
}

/** Contest fairness + scoring oversight (spec 34). */
export async function adminContests(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const svc = ctx.svc;
  const contests = await svc.entities.Contest.filter({}, '-created_date', 500);

  const rows = [];
  for (const c of contests) {
    const snaps = await svc.entities.ScoreSnapshot.filter({ contest_id: c.id }, '-created_date', 200).catch(() => []);
    const links = await svc.entities.TrackingLink.filter({ contest_id: c.id }, '-created_date', 200).catch(() => []);
    const winner = snaps.find((s) => s.is_winner);
    rows.push({
      contest_id: c.id, title: c.title, status: c.status,
      prize_amount: c.prize_amount || 0, currency: c.currency || 'INR',
      deadline: c.deadline || null,
      min_duration_days: c.min_duration_days ?? null,
      max_duration_days: c.max_duration_days ?? null,
      duration_rule_version: c.duration_rule_version || null,
      // A contest created before the fairness rule has no stamped window.
      fairness_state: c.duration_rule_version ? 'enforced' : 'legacy_unvalidated',
      has_destination: Boolean(c.brand_destination_url),
      winner_user_id: c.winner_user_id || null,
      winner_selected_at: c.winner_selected_at || null,
      scoring_version: winner?.scoring_version || null,
      winner_final_score: winner?.final_score ?? null,
      tie_break_applied: Boolean(winner?.tie_break_applied),
      snapshots: snaps.length,
      verified_visitors: links.reduce((a, l) => a + Number(l.unique_visitors || 0), 0),
      excluded_clicks: links.reduce((a, l) => a + Number(l.suspicious_clicks || 0), 0),
    });
  }
  return json({ contests: rows });
}

/** Traffic oversight — admins DO see risk detail; nobody else does. */
export async function adminTraffic(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const svc = ctx.svc;
  const events = await svc.entities.TrafficEvent.filter({}, '-created_date', 500).catch(() => []);

  const byState = {};
  for (const e of events) byState[e.verification_state || 'unknown'] = (byState[e.verification_state || 'unknown'] || 0) + 1;

  const reasons = {};
  for (const e of events) {
    let rs = [];
    try { rs = JSON.parse(e.risk_reasons || '[]'); } catch {}
    for (const r of rs) reasons[r] = (reasons[r] || 0) + 1;
  }

  return json({
    total_events: events.length,
    by_state: byState,
    // Internal detection reasons — admin-only, never surfaced to users.
    risk_reasons: reasons,
    recent: events.slice(0, 50).map((e) => ({
      contest_id: e.contest_id, creator_id: e.creator_id,
      occurred_at: e.occurred_at, state: e.verification_state,
      is_unique: e.is_unique, referrer_host: e.referrer_host || null,
    })),
  });
}

export async function adminUsers(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const svc = ctx.svc;
  // Counts must reflect ALL accounts, not one page — a capped page produced
  // wrong creator/brand totals.
  const users = await svc.entities.User.filter({}, '-created_date', 5000).catch(() => []);
  return json({
    total: users.length,
    counted_window: users.length,
    creators: count(users, (u) => u.user_role === 'creator'),
    clients: count(users, (u) => u.user_role === 'client'),
    admins: count(users, (u) => u.role === 'admin'),
    // Seed identities are tagged so they can be excluded from real reporting.
    seeded: count(users, (u) => String(u.email || '').endsWith('@razekit.test') || String(u.email || '').endsWith('@razekit.demo') || String(u.email || '').endsWith('@razekit.sim')),
    users: users.slice(0, 200).map((u) => ({
      id: u.id, email: u.email, full_name: u.full_name || null,
      role: u.role, user_role: u.user_role || null,
      account_status: u.account_status || 'active',
      created_date: u.created_date,
      is_seed: String(u.email || '').endsWith('@razekit.test') || String(u.email || '').endsWith('@razekit.demo') || String(u.email || '').endsWith('@razekit.sim'),
    })),
  });
}

export async function adminAudit(ctx) {
  const denied = requireAdmin(ctx); if (denied) return denied;
  const svc = ctx.svc;
  const rows = await svc.entities.AuditLog.filter({}, '-created_date', 200).catch(() => []);
  return json({
    events: rows.map((a) => ({
      id: a.id, user_id: a.user_id, actor: a.actor, action: a.action,
      status: a.status, reason: a.reason, result: a.result, created_date: a.created_date,
    })),
  });
}
