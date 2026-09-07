import { base44 } from '@/api/base44Client';

// ============================================================================
// LEADERBOARD ENGINE — computes global rank, percentiles, and top creator
// lists from CreatorStats records. Recalculated on demand (called after
// every XP update) so rankings stay current without manual refresh.
// ============================================================================

// Fetch all creator stats (capped) sorted by total XP for ranking
async function fetchAllStats() {
  return await base44.entities.CreatorStats.list('-total_xp', 500).catch(() => []);
}

// Get a user's global rank (1-based) and percentile
export async function getUserGlobalRank(userId) {
  if (!userId) return { rank: 0, percentile: 0, totalUsers: 0 };
  const all = await fetchAllStats();
  const idx = all.findIndex((s) => s.user_id === userId);
  if (idx === -1) return { rank: 0, percentile: 0, totalUsers: all.length };
  const rank = idx + 1;
  const percentile = all.length > 1 ? Math.round((1 - rank / all.length) * 100) : 100;
  return { rank, percentile, totalUsers: all.length };
}

// Persist the global rank onto the user's stats record
export async function refreshUserRank(stats) {
  if (!stats || !stats.user_id) return stats;
  const { rank } = await getUserGlobalRank(stats.user_id);
  if (rank && rank !== stats.global_rank) {
    await base44.entities.CreatorStats.update(stats.id, { global_rank: rank }).catch(() => {});
    return { ...stats, global_rank: rank };
  }
  return stats;
}

// Top winners — sorted by contests_won
export async function getTopWinners(limit = 10) {
  const all = await base44.asServiceRole.entities.CreatorStats.list('-contests_won', limit).catch(() => []);
  return all.filter((s) => (s.contests_won || 0) > 0).slice(0, limit);
}

// Top rated — sorted by reputation_score (requires min 3 reviews)
export async function getTopRated(limit = 10) {
  const all = await base44.asServiceRole.entities.CreatorStats.list('-reputation_score', limit * 3).catch(() => []);
  return all.filter((s) => (s.total_reviews || 0) >= 3).slice(0, limit);
}

// Most active — sorted by contests_joined
export async function getMostActive(limit = 10) {
  const all = await base44.asServiceRole.entities.CreatorStats.list('-contests_joined', limit).catch(() => []);
  return all.filter((s) => (s.contests_joined || 0) > 0).slice(0, limit);
}

// Monthly top — sorted by monthly_xp
export async function getMonthlyTop(limit = 10) {
  const all = await base44.asServiceRole.entities.CreatorStats.list('-monthly_xp', limit).catch(() => []);
  return all.filter((s) => (s.monthly_xp || 0) > 0).slice(0, limit);
}