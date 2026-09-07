export { timeAgo, formatCount } from '@/components/feed/feedData';

export function monthKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  const idx = parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11) return key;
  return `${MONTHS[idx]} ${y}`;
}

export function recentMonthKeys(count = 8) {
  const keys = [];
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return keys;
}

// A showcase post is "verified" only if it links to a contest the author actually won.
// Derived from authoritative Contest records (set by the client/admin), never a client flag.
export function isVerifiedWin(post, contest) {
  if (!post || !contest) return false;
  if (post.post_type !== 'showcase') return false;
  if (!post.contest_id || !post.submission_id) return false;
  if (!['winner_selected', 'completed'].includes(contest.status)) return false;
  return contest.winner_user_id === post.author_id && contest.winner_submission_id === post.submission_id;
}

export function contestMonthKey(contest) {
  return monthKey(contest.winner_selected_at || contest.completed_at || contest.created_date);
}

// Compute ranked monthly leaderboard from authoritative Contest records only.
// Each contest contributes once (keyed by contest), so duplicate payment events
// never double-count, and fake community posts never contribute.
export function computeLeaderboard(contests, mKey) {
  const map = new Map();
  for (const c of contests || []) {
    if (!c.winner_user_id) continue;
    if (!['winner_selected', 'completed'].includes(c.status)) continue;
    if (contestMonthKey(c) !== mKey) continue;
    const prize = Number(c.prize_amount) || 0;
    const winDate = c.winner_selected_at || c.completed_at || c.created_date;
    let entry = map.get(c.winner_user_id);
    if (!entry) {
      entry = { user_id: c.winner_user_id, verified_wins: 0, monthly_earnings: 0, firstWinAt: winDate, contests: [] };
      map.set(c.winner_user_id, entry);
    }
    entry.verified_wins += 1;
    entry.monthly_earnings += prize;
    entry.contests.push({ id: c.id, title: c.title, prize, category: c.category, winDate });
    if (new Date(winDate) < new Date(entry.firstWinAt)) entry.firstWinAt = winDate;
  }
  const rows = [...map.values()];
  rows.sort((a, b) =>
    b.monthly_earnings - a.monthly_earnings ||
    b.verified_wins - a.verified_wins ||
    new Date(a.firstWinAt) - new Date(b.firstWinAt)
  );
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function hotScore(post, likeCount, commentCount) {
  const eng = (likeCount || 0) + (commentCount || 0) * 2 + (post.shares_count || 0);
  const ageH = Math.max(1, (Date.now() - new Date(post.created_date).getTime()) / 3600000);
  return eng / Math.pow(ageH, 0.5);
}