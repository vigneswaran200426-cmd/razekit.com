import { base44 } from '@/api/base44Client';

// ============================================================================
// BADGE DEFINITIONS — each badge has an id, name, icon, category, and a
// `check(stats)` predicate. The engine awards badges automatically whenever
// stats change — no manual action needed.
// ============================================================================
export const BADGE_DEFINITIONS = [
  { id: 'first_win', name: 'First Win', icon: 'Crown', category: 'wins', description: 'Win your first contest', check: (s) => (s.contests_won || 0) >= 1 },
  { id: 'ten_wins', name: '10 Wins', icon: 'Trophy', category: 'wins', description: 'Win 10 contests', check: (s) => (s.contests_won || 0) >= 10 },
  { id: 'five_wins', name: 'Top Motion Designer', icon: 'Palette', category: 'wins', description: 'Win 5 contests', check: (s) => (s.contests_won || 0) >= 5 },
  { id: 'hundred_subs', name: '100 Submissions', icon: 'FileCheck', category: 'submissions', description: 'Submit 100 entries', check: (s) => (s.contests_submitted || 0) >= 100 },
  { id: 'prolific', name: 'Prolific Creator', icon: 'Film', category: 'submissions', description: 'Submit 50 entries', check: (s) => (s.contests_submitted || 0) >= 50 },
  { id: 'first_submit', name: 'First Submission', icon: 'Upload', category: 'submissions', description: 'Submit your first entry', check: (s) => (s.contests_submitted || 0) >= 1 },
  { id: 'five_star', name: '5-Star Creator', icon: 'Star', category: 'rating', description: 'Maintain a 5.0 average with 5+ reviews', check: (s) => (s.total_reviews || 0) >= 5 && s.review_score_sum / s.total_reviews >= 4.95 },
  { id: 'rising_star', name: 'Rising Star', icon: 'TrendingUp', category: 'level', description: 'Reach Level 10', check: (s) => (s.level || 1) >= 10 },
  { id: 'verified', name: 'Verified Creator', icon: 'BadgeCheck', category: 'level', description: 'Reach Level 20', check: (s) => (s.level || 1) >= 20 },
  { id: 'elite', name: 'Elite Creator', icon: 'Sparkles', category: 'level', description: 'Reach Level 40', check: (s) => (s.level || 1) >= 40 },
  { id: 'legend', name: 'Legend', icon: 'Award', category: 'level', description: 'Reach Level 50', check: (s) => (s.level || 1) >= 50 },
  { id: 'fast_delivery', name: 'Fast Delivery', icon: 'Zap', category: 'delivery', description: '10 on-time submissions', check: (s) => (s.on_time_count || 0) >= 10 },
  { id: 'early_bird', name: 'Early Bird', icon: 'Clock', category: 'delivery', description: '5 on-time submissions', check: (s) => (s.on_time_count || 0) >= 5 },
  { id: 'trusted', name: 'Trusted Professional', icon: 'Shield', category: 'reputation', description: 'Reputation 75+', check: (s) => (s.reputation_score || 0) >= 75 },
  { id: 'streak_master', name: 'Streak Master', icon: 'Flame', category: 'streak', description: '10 quality submissions in a row', check: (s) => (s.best_streak || 0) >= 10 },
  { id: 'quality_king', name: 'Quality King', icon: 'Gem', category: 'quality', description: 'Average quality score 90+', check: (s) => (s.quality_score_count || 0) >= 3 && s.quality_score_sum / s.quality_score_count >= 90 },
  { id: 'clean_record', name: 'Clean Record', icon: 'CheckCircle', category: 'trust', description: 'Zero penalties with 10+ contests', check: (s) => (s.contests_joined || 0) >= 10 && (s.penalties || 0) === 0 },
];

// ============================================================================
// UNLOCK DEFINITIONS — features that unlock automatically at level thresholds.
// ============================================================================
export const UNLOCK_DEFINITIONS = [
  { level: 5, label: 'Bronze Contests', description: 'Access to mid-tier prize pools' },
  { level: 10, label: 'Silver Contests', description: '₹5K contest tier unlocked' },
  { level: 15, label: 'Priority Support', description: 'Faster response times' },
  { level: 20, label: 'Verified Creator', description: 'Platform verification badge + ₹10K contests' },
  { level: 25, label: 'Featured Placement', description: 'Eligible for featured creator spots' },
  { level: 30, label: 'Premium Clients', description: 'Exclusive brand projects' },
  { level: 40, label: 'Elite Contests', description: 'Highest prize pool access' },
  { level: 50, label: 'Legend Status', description: 'All features unlocked + special events' },
];

export function getUnlocksForLevel(level) {
  return UNLOCK_DEFINITIONS.filter((u) => level >= u.level);
}

export function getNextUnlock(level) {
  return UNLOCK_DEFINITIONS.find((u) => u.level > level) || null;
}

// ============================================================================
// AUTO-AWARD BADGES — checks all badges against current stats and awards any
// newly-earned ones. Idempotent: skips badges already earned.
// Returns the list of newly awarded badges.
// ============================================================================
export async function checkAndAwardBadges(stats, contestId) {
  if (!stats || !stats.user_id) return [];
  let earned = [];
  try { earned = JSON.parse(stats.badges_earned || '[]'); } catch { earned = []; }
  const earnedIds = new Set(earned);
  const newlyAwarded = [];

  for (const badge of BADGE_DEFINITIONS) {
    if (earnedIds.has(badge.id)) continue;
    if (!badge.check(stats)) continue;

    // Award the badge
    await base44.entities.BadgeAward.create({
      user_id: stats.user_id,
      badge_id: badge.id,
      badge_name: badge.name,
      badge_icon: badge.icon,
      category: badge.category,
      description: badge.description,
      contest_id: contestId || '',
    }).catch(() => {});

    earnedIds.add(badge.id);
    newlyAwarded.push(badge);
  }

  if (newlyAwarded.length > 0) {
    await base44.entities.CreatorStats.update(stats.id, {
      badges_earned: JSON.stringify([...earnedIds]),
    }).catch(() => {});
  }

  return newlyAwarded;
}

// Fetch all badges earned by a user (for profile display)
export async function getUserBadges(userId) {
  if (!userId) return [];
  const awards = await base44.entities.BadgeAward.filter({ user_id: userId }, '-created_date', 100).catch(() => []);
  // Dedupe by badge_id (keep latest)
  const seen = new Map();
  for (const a of awards) {
    if (!seen.has(a.badge_id)) seen.set(a.badge_id, a);
  }
  return [...seen.values()];
}