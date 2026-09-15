// @ts-nocheck
// The notification centre.
//
// One feed, one read-state, one place the frontend polls. Everything in it was
// persisted by notify/emit.ts when a real backend event happened — so a refresh
// never loses anything, and nothing here was invented by the browser.
import { json } from './context.js';
import { CATEGORY, SEVERITY, PERSISTENT } from '../notify/emit.js';

const err = (code, message, status = 400) => json({ error: { code, message } }, status);

/**
 * Derive category and severity for a row that predates them.
 *
 * Notifications were created ad hoc before emit() existed, and rows written by
 * any handler not yet migrated still arrive without these fields. Deriving them
 * from the legacy `type` and the wording means the feed filters correctly for
 * every row rather than dumping the old ones into an "unknown" bucket.
 */
function derive(n) {
  if (n.category && n.severity) return { category: n.category, severity: n.severity };

  const type = String(n.type || '');
  const text = `${n.title || ''} ${n.description || ''}`.toLowerCase();

  const category = n.category
    || (type === 'contest_won' ? CATEGORY.WINNER
      : type === 'payment_received' ? (/payout|withdraw/.test(text) ? CATEGORY.PAYOUT : CATEGORY.PAYMENT)
      : type === 'submission_update' ? CATEGORY.SUBMISSION
      : /contest|campaign/.test(text) ? CATEGORY.CONTEST
      : /support|ticket/.test(text) ? CATEGORY.SUPPORT
      : CATEGORY.SYSTEM);

  // A row is treated as critical only when its wording describes something
  // still wrong. Guessing high would make every old notification undismissable.
  const severity = n.severity
    || (/could not|failed|rejected|disqualif|not met|did not meet|needs attention|on hold/.test(text)
      ? SEVERITY.CRITICAL
      : /verif|winner|won|approved|paid|processed/.test(text)
        ? SEVERITY.IMPORTANT
        : SEVERITY.INFO);

  return { category, severity };
}

function publicNotification(n) {
  const { category, severity } = derive(n);
  return {
    id: n.id,
    category,
    severity,
    title: n.title,
    body: n.description || '',
    read: Boolean(n.read),
    contest_id: n.contest_id || null,
    submission_id: n.related_submission_id || null,
    actor_name: n.actor_name || null,
    // Where this notification goes when tapped. Deep links are how a feed stops
    // being a list of things you then have to go and find.
    action_url: n.action_url || (n.contest_id ? `/contest/${n.contest_id}` : null),
    // Critical items stay on screen while the issue is live rather than
    // disappearing after three seconds.
    persistent: PERSISTENT.includes(severity),
    created_date: n.created_date,
  };
}

// ── notificationFeed ────────────────────────────────────────────────────────
/**
 * The caller's own notifications. Ownership comes from the session, never from
 * the payload — a user cannot read someone else's feed by passing an id.
 */
export async function notificationFeed(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const b = ctx.body || {};
  const limit = Math.min(Number(b.limit) || 60, 200);

  const rows = await ctx.svc.entities.Notification
    .filter({ recipient_user_id: ctx.user.id }, '-created_date', 300).catch(() => []);

  let list = rows.map(publicNotification);
  if (b.category) list = list.filter((n) => n.category === b.category);
  if (b.unread_only) list = list.filter((n) => !n.read);

  const byCategory = {};
  for (const n of rows.map(publicNotification)) {
    byCategory[n.category] = (byCategory[n.category] || 0) + (n.read ? 0 : 1);
  }

  return json({
    notifications: list.slice(0, limit),
    unread: rows.filter((n) => !n.read).length,
    // Live issues the UI should keep showing rather than auto-dismiss.
    active_critical: list.filter((n) => n.persistent && !n.read),
    unread_by_category: byCategory,
    categories: Object.values(CATEGORY),
    total: rows.length,
  });
}

// ── notificationRead ────────────────────────────────────────────────────────
export async function notificationRead(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const b = ctx.body || {};

  if (b.all) {
    const rows = await ctx.svc.entities.Notification
      .filter({ recipient_user_id: ctx.user.id, read: false }, '-created_date', 300).catch(() => []);
    for (const n of rows) await ctx.svc.entities.Notification.update(n.id, { read: true }).catch(() => null);
    return json({ marked: rows.length });
  }

  const ids = Array.isArray(b.ids) ? b.ids : b.id ? [b.id] : [];
  if (!ids.length) return err('ID_REQUIRED', 'Pass id, ids, or all: true.');

  let marked = 0;
  for (const id of ids.slice(0, 100)) {
    const n = await ctx.svc.entities.Notification.get(id).catch(() => null);
    // Re-check ownership per row: an id from another user's feed changes nothing.
    if (!n || n.recipient_user_id !== ctx.user.id) continue;
    await ctx.svc.entities.Notification.update(id, { read: true }).catch(() => null);
    marked++;
  }
  return json({ marked });
}
