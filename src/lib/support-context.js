import { base44 } from '@/api/base44Client';

// Fetch the current user's OWN authorized data (RLS already restricts to their records).
// Returns a compact summary injected into the Help assistant context —
// never another user's private data.
export async function fetchUserContext(user) {
  if (!user) return '';
  const lines = [];
  try {
    if (user.user_role === 'client') {
      const [contests, subs, wallet] = await Promise.all([
        base44.entities.Contest.filter({ created_by_id: user.id }, '-created_date', 10).catch(() => []),
        base44.entities.Submission.filter({ client_id: user.id }, '-created_date', 10).catch(() => []),
        base44.entities.Wallet.filter({ user_id: user.id }).catch(() => []),
      ]);
      lines.push(`Brand's contests (${contests.length}): ` + contests.map((c) => `"${c.title}" (${c.status}, ₹${c.prize_amount || 0})`).join(', '));
      lines.push(`Submissions received on their contests (${subs.length}): ` + subs.map((s) => s.status).join(', '));
      if (wallet[0]) lines.push(`Wallet: available ₹${wallet[0].available_balance || 0}, reserved ₹${wallet[0].reserved_funds || 0}.`);
    } else {
      const [subs, wallet, stats, withdrawals] = await Promise.all([
        base44.entities.Submission.filter({ created_by_id: user.id }, '-created_date', 10).catch(() => []),
        base44.entities.Wallet.filter({ user_id: user.id }).catch(() => []),
        base44.entities.CreatorStats.filter({ user_id: user.id }).catch(() => []),
        base44.entities.WithdrawalRequest.filter({ user_id: user.id }, '-created_date', 5).catch(() => []),
      ]);
      lines.push(`Creator's submissions (${subs.length}): ` + subs.map((s) => `Contest ${String(s.contest_id || '').slice(-6)} (${s.status})`).join(', '));
      if (stats[0]) lines.push(`Verified wins: ${stats[0].contests_won || 0}.`);
      if (wallet[0]) lines.push(`Wallet: available ₹${wallet[0].available_balance || 0}, pending ₹${wallet[0].pending_balance || 0}.`);
      if (withdrawals.length) lines.push(`Recent withdrawals: ` + withdrawals.map((w) => `${w.status} ₹${w.amount}`).join(', '));
    }
  } catch (e) {}
  return lines.filter(Boolean).join('\n');
}

// Route context resolver — when Help is opened from a contest route, fetch
// the live contest + the user's own submissions on it so the assistant can
// answer with actual workflow state (e.g. "your submission is under review").
export async function resolveRouteContext(route, user) {
  const m = (route || '').match(/^\/contest\/([^/]+)/);
  if (!m || !user?.id) return '';
  const out = [];
  try {
    const contest = await base44.entities.Contest.get(m[1]).catch(() => null);
    if (contest) {
      out.push(`Current contest: "${contest.title}" — status: ${contest.status}${contest.prize_amount ? `, prize ₹${contest.prize_amount}` : ''}.`);
    }
    const filter = user.user_role === 'client'
      ? { contest_id: m[1], client_id: user.id }
      : { contest_id: m[1], created_by_id: user.id };
    const subs = await base44.entities.Submission.filter(filter, '-created_date', 5).catch(() => []);
    if (subs.length) {
      out.push(`Submissions on this contest (${subs.length}), latest statuses: ${subs.map((s) => s.status).join(', ')}.`);
    }
  } catch (e) {}
  return out.join('\n');
}

export function guessCategory(text) {
  const t = (text || '').toLowerCase();
  if (/security|hack|suspicious|breach/.test(t)) return 'Security';
  if (/otp|access code/.test(t)) return 'OTP';
  if (/footage|drive|access/.test(t)) return 'Footage Access';
  if (/withdraw|payout|bank/.test(t)) return 'Withdrawal';
  if (/wallet|balance|deposit/.test(t)) return 'Wallet';
  if (/pay|stripe|fund|charge|card|escrow|prize/.test(t)) return 'Payment';
  if (/reputation|review|rating/.test(t)) return 'XP/Reputation';
  if (/submission|upload|video|revision/.test(t)) return 'Submission';
  if (/notif|invitation/.test(t)) return 'Notifications';
  if (/profile|username|avatar/.test(t)) return 'Profile';
  if (/context|contest|prize|deadline|winner|handover|collab/.test(t)) return 'Context';
  if (/account|login|password|role/.test(t)) return 'Account';
  return 'Other';
}