import { base44 } from '@/api/base44Client';

// Allowed notification types for the feed (everything else is hidden).
export const ALLOWED_TYPES = {
  social: ['post_liked', 'post_commented', 'comment_replied', 'user_mentioned', 'post_trending'],
  context: ['contest_invitation', 'submission_uploaded', 'contest_submission_received', 'shortlisted', 'contest_win', 'winner_announced', 'deadline_tomorrow', 'contest_ended', 'footage_approved', 'contest_joined', 'winner_content_requested', 'winner_content_submitted', 'winner_content_revision', 'winner_content_published', 'account_warning', 'account_restricted', 'account_suspended', 'account_terminated', 'report_update'],
  money: ['payment_received', 'withdraw_completed'],
};
export const ALL_ALLOWED = [...ALLOWED_TYPES.social, ...ALLOWED_TYPES.context, ...ALLOWED_TYPES.money];

export const isAllowed = (type) => ALL_ALLOWED.includes(type);

// Deep-link to the exact destination — never a generic dashboard.
export function notifLink(n) {
  const ctx = n.contest_id;
  switch (n.type) {
    case 'post_liked':
    case 'post_commented':
    case 'comment_replied':
    case 'user_mentioned':
    case 'post_trending':
      return n.related_post_id ? `/community/post/${n.related_post_id}` : null;
    case 'contest_win':
    case 'winner_announced':
      return ctx ? `/contest/${ctx}/results` : null;
    // Winner publishing workflow — deep-link straight to the exact step.
    case 'winner_content_requested':
    case 'winner_content_revision':
      return ctx ? `/contest/${ctx}/winner-content` : null;
    case 'winner_content_submitted':
      return ctx ? `/contest/${ctx}/winner-approval` : null;
    case 'winner_content_published':
      return n.related_winner_id ? `/winner/${n.related_winner_id}` : (ctx ? `/winners-hub` : null);
    case 'payment_received':
    case 'withdraw_completed':
      return '/wallet';
    case 'contest_invitation':
    case 'submission_uploaded':
    case 'contest_submission_received':
    case 'shortlisted':
    case 'deadline_tomorrow':
    case 'contest_ended':
    case 'footage_approved':
    case 'contest_joined':
      return ctx ? `/contest/${ctx}` : null;
    case 'account_warning':
    case 'account_restricted':
    case 'account_suspended':
    case 'account_terminated':
    case 'report_update':
      return '/account-standing';
    default:
      return null;
  }
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return 'now';
}

// Group similar social events on the same content ("X and N others liked your post").
export function groupNotifications(list) {
  const out = [];
  const used = new Set();
  for (const n of list) {
    if (used.has(n.id)) continue;
    if (n.type === 'post_liked' && n.related_post_id) {
      const peers = list.filter((x) => x.type === 'post_liked' && x.related_post_id === n.related_post_id);
      if (peers.length > 1) {
        peers.forEach((p) => used.add(p.id));
        out.push({ ...peers[0], _groupCount: peers.length, _firstActor: peers[0].actor_name || 'Someone' });
        continue;
      }
    }
    used.add(n.id);
    out.push(n);
  }
  return out;
}

export function groupedTitle(n) {
  if (n._groupCount && n._groupCount > 1) {
    const rest = n._groupCount - 1;
    return `${n._firstActor} and ${rest} other${rest !== 1 ? 's' : ''} liked your post`;
  }
  return n.title;
}

// ---- Context Invitation actions ----

export async function sendInvitation({ contest, clientUser, clientProfile, creator }) {
  // Authorization: only a Client who OWNS the Context may invite a creator to it.
  if (!clientUser || clientUser.user_role !== 'client') throw new Error('Only brands can send invitations.');
  if (!creator || !creator.user_id) throw new Error('Invalid recipient.');
  if (creator.user_id === clientUser.id) throw new Error("You can't invite yourself.");
  let ctx = contest;
  if (!ctx || ctx.created_by_id !== clientUser.id) {
    ctx = await base44.entities.Contest.get(contest?.id).catch(() => null);
  }
  if (!ctx || ctx.created_by_id !== clientUser.id) throw new Error('You can only invite creators to your own contests.');
  if (ctx.status !== 'open') throw new Error('This contest is no longer open for invitations.');
  // Prevent a duplicate pending invitation for the same Context + Creator.
  const existing = await base44.entities.Notification.filter({
    recipient_user_id: creator.user_id, contest_id: ctx.id, type: 'contest_invitation',
  }).catch(() => []);
  if (existing.find((e) => (e.invitation_status || 'pending') === 'pending')) {
    return { ok: false, duplicate: true };
  }
  const businessName = clientProfile?.company_name || clientProfile?.display_name || clientUser?.full_name || 'A business';
  const prize = contest.prize_amount ? `₹${Number(contest.prize_amount).toLocaleString('en-IN')} prize` : '';
  const deadline = contest.deadline ? `Due ${new Date(contest.deadline).toLocaleDateString('en-IN')}` : '';
  const desc = [ctx.description?.slice(0, 110), prize, deadline].filter(Boolean).join(' · ');
  await base44.entities.Notification.create({
    type: 'contest_invitation',
    recipient_user_id: creator.user_id,
    actor_user_id: clientUser.id,
    actor_name: businessName,
    title: `${businessName} invited you to a contest`,
    description: desc,
    contest_id: ctx.id,
    invitation_status: 'pending',
  });
  return { ok: true };
}

export async function acceptInvitation(notification) {
  const ctx = await base44.entities.Contest.get(notification.contest_id).catch(() => null);
  if (!ctx) throw new Error('This contest is no longer available.');
  if (ctx.status !== 'open') throw new Error('This contest is no longer open.');
  // Join: create a working submission (creator-only via RLS).
  await base44.entities.Submission.create({ contest_id: ctx.id, client_id: ctx.created_by_id, status: 'working' });
  await base44.entities.Notification.update(notification.id, { invitation_status: 'accepted', read: true });
  await base44.entities.Notification.create({
    type: 'contest_submission_received', recipient_user_id: ctx.created_by_id,
    actor_user_id: notification.recipient_user_id, actor_name: notification.recipient_user_id,
    title: 'A creator accepted your Context invitation', description: ctx.title, contest_id: ctx.id,
  }).catch(() => {});
  return ctx;
}

export async function declineInvitation(notification) {
  await base44.entities.Notification.update(notification.id, { invitation_status: 'declined', read: true });
}