import { base44 } from '@/api/base44Client';
import { checkAndAwardBadges, getUserBadges, BADGE_DEFINITIONS, getUnlocksForLevel, getNextUnlock } from '@/lib/xp/badges';
import { refreshUserRank, getUserGlobalRank, getTopWinners, getTopRated, getMostActive, getMonthlyTop } from '@/lib/xp/leaderboard';
import { calculateQualityScore, analyzeSubmissionQuality, getAiQualityScore } from '@/lib/xp/quality';
import { checkDuplicateSubmission, runAntiCheatScan, flagSuspiciousUser, detectXpFarming } from '@/lib/xp/anticheat';

// Re-export sub-engine APIs so everything is reachable from one import
export {
  checkAndAwardBadges, getUserBadges, BADGE_DEFINITIONS, getUnlocksForLevel, getNextUnlock,
  refreshUserRank, getUserGlobalRank, getTopWinners, getTopRated, getMostActive, getMonthlyTop,
  calculateQualityScore, analyzeSubmissionQuality, getAiQualityScore,
  checkDuplicateSubmission, runAntiCheatScan, flagSuspiciousUser, detectXpFarming,
};

// ============================================================================
// LEVEL TABLE — increasing XP thresholds (interpolated from key milestones)
// ============================================================================
const RAW_THRESHOLDS = [
  { level: 1, xp: 0 },
  { level: 2, xp: 500 },
  { level: 3, xp: 1200 },
  { level: 4, xp: 2200 },
  { level: 5, xp: 3500 },
  { level: 10, xp: 12000 },
  { level: 20, xp: 40000 },
  { level: 30, xp: 90000 },
  { level: 40, xp: 180000 },
  { level: 50, xp: 350000 },
];

function buildLevelTable() {
  const table = [];
  for (let i = 0; i < RAW_THRESHOLDS.length - 1; i++) {
    const curr = RAW_THRESHOLDS[i];
    const next = RAW_THRESHOLDS[i + 1];
    const xpPerLevel = (next.xp - curr.xp) / (next.level - curr.level);
    for (let l = curr.level; l < next.level; l++) {
      table.push({ level: l, xp: Math.round(curr.xp + (l - curr.level) * xpPerLevel) });
    }
  }
  table.push(RAW_THRESHOLDS[RAW_THRESHOLDS.length - 1]);
  return table;
}

export const LEVEL_TABLE = buildLevelTable();

export function getLevelFromXp(totalXp) {
  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_TABLE[i].xp) return LEVEL_TABLE[i].level;
  }
  return 1;
}

export function getLevelProgress(totalXp) {
  const level = getLevelFromXp(totalXp);
  const levelIdx = LEVEL_TABLE.findIndex((l) => l.level === level);
  const currentThreshold = LEVEL_TABLE[levelIdx].xp;
  const nextLevel = LEVEL_TABLE[levelIdx + 1];
  const nextThreshold = nextLevel ? nextLevel.xp : currentThreshold;
  const xpIntoLevel = totalXp - currentThreshold;
  const xpForNextLevel = nextThreshold - currentThreshold;
  return {
    level,
    xpIntoLevel,
    xpForNextLevel: nextLevel ? xpForNextLevel : 0,
    progressPct: nextLevel ? Math.min(100, (xpIntoLevel / xpForNextLevel) * 100) : 100,
    isMaxLevel: !nextLevel,
    nextUnlock: getNextUnlock(level),
  };
}

export function getRankName(level) {
  if (level >= 50) return 'Legend';
  if (level >= 40) return 'Diamond';
  if (level >= 30) return 'Platinum';
  if (level >= 20) return 'Gold';
  if (level >= 10) return 'Silver';
  if (level >= 5) return 'Bronze';
  return 'Rookie';
}

// ============================================================================
// XP TABLES
// ============================================================================
export const PARTICIPATION_XP = { join: 5, withdraw: -5, submit_on_time: 20, submit_late: 0, no_submit: -15 };
export const RESULT_XP = { winner: 250, runner_up: 120, top5: 60, honorable: 40, accepted: 30, lost: 0 };
export const REVIEW_XP = { 5: 100, 4: 70, 3: 40, 2: 10, 1: -50 };
export const QUALITY_XP = [
  { min: 95, xp: 80, label: '95-100' },
  { min: 90, xp: 60, label: '90-94' },
  { min: 80, xp: 40, label: '80-89' },
  { min: 70, xp: 20, label: '70-79' },
  { min: 0, xp: 0, label: 'Below 70' },
];
export const CONSISTENCY_BONUS = { 5: 50, 10: 120, 25: 300 };
export const PENALTY_XP = {
  spam: -100, copyright: -300, fake: -500, abandonment: -50, reports: -150,
  rule_violation: -200, duplicate: -75, low_quality: -40, late: 0,
};
export const WITHDRAWAL_XP = { approved: 50, completed: 100 };

export function getReviewXp(rating) { return REVIEW_XP[rating] || 0; }
export function getQualityXp(score) {
  if (score == null) return 0;
  return QUALITY_XP.find((q) => score >= q.min)?.xp || 0;
}
export function getDeliveryXp(submittedAt, deadline) {
  if (!submittedAt || !deadline) return { amount: 10, label: 'On time' };
  const diff = new Date(deadline).getTime() - new Date(submittedAt).getTime();
  if (diff >= 48 * 3600000) return { amount: 30, label: '>48h early' };
  if (diff >= 24 * 3600000) return { amount: 20, label: '24-48h early' };
  if (diff >= 0) return { amount: 10, label: 'On time' };
  return { amount: 0, label: 'Late' };
}
export function getConsistencyBonus(currentStreak) {
  const milestones = [25, 10, 5];
  for (const m of milestones) {
    if (currentStreak === m) return { amount: CONSISTENCY_BONUS[m], milestone: m };
  }
  return null;
}

// ============================================================================
// REPUTATION SCORE (0-100)
// Weighted: Rating 40% | Win Rate 20% | On-Time 15% | Compliance 15% | Trust 10%
// ============================================================================
export function calculateReputation(stats) {
  const avgRating = stats.total_reviews > 0 ? stats.review_score_sum / stats.total_reviews : 0;
  const ratingScore = (avgRating / 5) * 100;
  const winRate = stats.contests_joined > 0 ? (stats.contests_won / stats.contests_joined) * 100 : 0;
  const submitted = (stats.on_time_count || 0) + (stats.late_count || 0);
  const onTimeRate = submitted > 0 ? (stats.on_time_count / submitted) * 100 : 100;
  const complianceScore = Math.max(0, 100 - (stats.penalties || 0) * 10);
  const trustScore = stats.account_trust ?? 50;
  return Math.round(
    ratingScore * 0.4 + winRate * 0.2 + onTimeRate * 0.15 + complianceScore * 0.15 + trustScore * 0.1
  );
}

// ============================================================================
// STATS HELPER — get or create the aggregated stats record for a user
// ============================================================================
export async function getOrCreateCreatorStats(userId) {
  if (!userId) return null;
  const existing = await base44.entities.CreatorStats.filter({ user_id: userId }, '-created_date', 1);
  if (existing.length > 0) return existing[0];
  return await base44.entities.CreatorStats.create({
    user_id: userId,
    total_xp: 0,
    monthly_xp: 0,
    level: 1,
    reputation_score: 0,
    global_rank: 0,
    contests_joined: 0,
    contests_submitted: 0,
    contests_won: 0,
    contests_runner_up: 0,
    contests_top5: 0,
    total_reviews: 0,
    review_score_sum: 0,
    on_time_count: 0,
    late_count: 0,
    current_streak: 0,
    best_streak: 0,
    penalties: 0,
    quality_score_avg: 0,
    quality_score_sum: 0,
    quality_score_count: 0,
    account_trust: 50,
    flagged_count: 0,
    abandoned_count: 0,
    duplicate_count: 0,
    badges_earned: '[]',
  });
}

// ============================================================================
// CORE ENGINE — applies an XP delta, recalculates level + reputation,
// auto-awards badges, refreshes rank, and runs anti-cheat. This is the single
// function every event handler routes through.
// ============================================================================
async function applyXp({ userId, category, amount, description, contestId, resultType, rating, qualityScore, breakdown }) {
  if (!userId) return null;

  await base44.entities.XpTransaction.create({
    user_id: userId,
    category,
    amount,
    description: description || '',
    contest_id: contestId || '',
    breakdown: breakdown ? JSON.stringify(breakdown) : '',
    result_type: resultType || '',
    rating: rating || 0,
    quality_score: qualityScore || 0,
  });

  const stats = await getOrCreateCreatorStats(userId);
  if (!stats) return null;

  const prevLevel = stats.level || 1;
  const newTotalXp = Math.max(0, (stats.total_xp || 0) + amount);
  const newMonthlyXp = Math.max(0, (stats.monthly_xp || 0) + amount);
  const newLevel = getLevelFromXp(newTotalXp);
  const updates = { total_xp: newTotalXp, monthly_xp: newMonthlyXp, level: newLevel };

  if (category === 'penalty') {
    updates.penalties = (stats.penalties || 0) + 1;
  }

  updates.reputation_score = calculateReputation({ ...stats, ...updates });
  const updated = await base44.entities.CreatorStats.update(stats.id, updates);
  const leveledUp = newLevel > prevLevel;

  // Background automation: badges, leaderboard, anti-cheat (fire-and-forget)
  checkAndAwardBadges({ ...stats, ...updates, id: stats.id, level: newLevel }, contestId).catch(() => {});
  refreshUserRank(updated).catch(() => {});
  runAntiCheatScan(userId).catch(() => {});

  return { totalXp: newTotalXp, level: newLevel, earned: amount, leveledUp, prevLevel };
}

// ============================================================================
// EVENT HANDLERS — one per automatic event. Each is fully automatic; the UI
// flows just call them at the right moment (no admin involvement).
// ============================================================================

// 1. Contest Joined → +5 XP
export async function awardJoinXp(userId, contestId, contestTitle) {
  return applyXp({
    userId, category: 'join', amount: PARTICIPATION_XP.join,
    description: `Joined contest: ${contestTitle}`, contestId,
    breakdown: [{ label: 'Joined Contest', amount: PARTICIPATION_XP.join }],
  });
}

// 2. Contest Withdrawn → -5 XP + abandoned counter
export async function awardWithdrawXp(userId, contestId, contestTitle) {
  const res = await applyXp({
    userId, category: 'penalty', amount: PARTICIPATION_XP.withdraw,
    description: `Withdrew from contest: ${contestTitle}`, contestId,
    breakdown: [{ label: 'Contest Withdrawal', amount: PARTICIPATION_XP.withdraw }],
  });
  const stats = await getOrCreateCreatorStats(userId);
  if (stats) {
    await base44.entities.CreatorStats.update(stats.id, {
      abandoned_count: (stats.abandoned_count || 0) + 1,
      current_streak: 0,
    }).catch(() => {});
  }
  return res;
}

// 3. Submission Uploaded → quality analysis + duplicate check + XP
export async function awardSubmitXp(userId, contestId, contestTitle, submittedAt, deadline) {
  const isLate = deadline && new Date(submittedAt).getTime() > new Date(deadline).getTime();
  const submitXp = isLate ? PARTICIPATION_XP.submit_late : PARTICIPATION_XP.submit_on_time;
  const delivery = getDeliveryXp(submittedAt, deadline);
  const total = submitXp + delivery.amount;

  await applyXp({
    userId, category: 'submit', amount: total,
    description: `Submitted entry for: ${contestTitle}`, contestId,
    breakdown: [
      { label: isLate ? 'Late Submission' : 'Submit Before Deadline', amount: submitXp },
      { label: `Fast Delivery (${delivery.label})`, amount: delivery.amount },
    ],
  });

  // Update submission-specific counters (streak, on-time)
  const stats = await getOrCreateCreatorStats(userId);
  if (stats) {
    const updates = {
      contests_submitted: (stats.contests_submitted || 0) + 1,
      last_contest_at: new Date().toISOString(),
    };
    if (!isLate) {
      updates.on_time_count = (stats.on_time_count || 0) + 1;
      const newStreak = (stats.current_streak || 0) + 1;
      updates.current_streak = newStreak;
      updates.best_streak = Math.max(stats.best_streak || 0, newStreak);
    } else {
      updates.late_count = (stats.late_count || 0) + 1;
      updates.current_streak = 0;
    }
    updates.reputation_score = calculateReputation({ ...stats, ...updates });
    await base44.entities.CreatorStats.update(stats.id, updates);

    // Consistency bonus at streak milestones
    const bonus = getConsistencyBonus(updates.current_streak);
    if (bonus) {
      await applyXp({
        userId, category: 'consistency', amount: bonus.amount,
        description: `Consistency milestone: ${bonus.milestone} quality submissions in a row`, contestId,
        breakdown: [{ label: `Consistency Bonus (${bonus.milestone} streak)`, amount: bonus.amount }],
      });
    }
  }

  return { earned: total };
}

// 3b. Submission Updated (re-upload) — small participation credit, no double counting
export async function awardSubmissionUpdateXp(userId, contestId, contestTitle) {
  return applyXp({
    userId, category: 'submit', amount: 3,
    description: `Updated submission for: ${contestTitle}`, contestId,
    breakdown: [{ label: 'Submission Update', amount: 3 }],
  });
}

// 4. Contest Outcome — result XP + client review XP (winner, runner-up, top5, etc.)
export async function awardContestOutcome({ userId, contestId, contestTitle, resultType, rating }) {
  const resultXp = RESULT_XP[resultType] || 0;
  const reviewXp = rating ? getReviewXp(rating) : 0;
  const total = resultXp + reviewXp;

  await base44.entities.XpTransaction.create({
    user_id: userId, category: 'result', amount: resultXp,
    description: `Contest result (${resultType}): ${contestTitle}`, contest_id: contestId,
    breakdown: JSON.stringify([{ label: `Result: ${resultType.replace('_', ' ')}`, amount: resultXp }]),
    result_type: resultType,
  });

  if (rating) {
    await base44.entities.XpTransaction.create({
      user_id: userId, category: 'review', amount: reviewXp,
      description: `Client review (${rating}\u2605): ${contestTitle}`, contest_id: contestId,
      breakdown: JSON.stringify([{ label: `Client Review (${rating}\u2605)`, amount: reviewXp }]),
      rating,
    });
  }

  const stats = await getOrCreateCreatorStats(userId);
  if (!stats) return null;

  const prevLevel = stats.level || 1;
  const newTotalXp = Math.max(0, (stats.total_xp || 0) + total);
  const newMonthlyXp = Math.max(0, (stats.monthly_xp || 0) + total);
  const newLevel = getLevelFromXp(newTotalXp);
  const updates = { total_xp: newTotalXp, monthly_xp: newMonthlyXp, level: newLevel };

  if (resultType === 'winner') updates.contests_won = (stats.contests_won || 0) + 1;
  if (resultType === 'runner_up') updates.contests_runner_up = (stats.contests_runner_up || 0) + 1;
  if (resultType === 'top5') updates.contests_top5 = (stats.contests_top5 || 0) + 1;
  if (rating) {
    updates.total_reviews = (stats.total_reviews || 0) + 1;
    updates.review_score_sum = (stats.review_score_sum || 0) + rating;
  }
  updates.reputation_score = calculateReputation({ ...stats, ...updates });
  const updated = await base44.entities.CreatorStats.update(stats.id, updates);
  const leveledUp = newLevel > prevLevel;

  // Background: badges + rank + anti-cheat
  checkAndAwardBadges({ ...stats, ...updates, id: stats.id, level: newLevel }, contestId).catch(() => {});
  refreshUserRank(updated).catch(() => {});
  runAntiCheatScan(userId).catch(() => {});

  return { totalXp: newTotalXp, level: newLevel, earned: total, leveledUp, prevLevel };
}

// 4b. Runner-up specifically (when client explicitly selects runner-up)
export async function awardRunnerUpXp({ userId, contestId, contestTitle, rating }) {
  return awardContestOutcome({ userId, contestId, contestTitle, resultType: 'runner_up', rating });
}

// 5. AI Quality Analysis Completed — award quality XP based on score
export async function awardAiQualityXp({ userId, contestId, contestTitle, qualityScore }) {
  const qualityXp = getQualityXp(qualityScore);
  if (qualityXp === 0) return { earned: 0 };
  return applyXp({
    userId, category: 'quality', amount: qualityXp,
    description: `AI quality score ${qualityScore}/100: ${contestTitle}`, contestId,
    qualityScore,
    breakdown: [{ label: `Quality Score (${qualityScore}/100)`, amount: qualityXp }],
  });
}

// 6. Penalties — spam, copyright, fake, abandonment, rule violation, duplicate, low quality
export async function awardPenalty({ userId, penaltyType, contestId, description }) {
  const amount = PENALTY_XP[penaltyType] ?? -50;

  // For duplicate submissions, increment duplicate counter
  if (penaltyType === 'duplicate') {
    const stats = await getOrCreateCreatorStats(userId);
    if (stats) {
      await base44.entities.CreatorStats.update(stats.id, {
        duplicate_count: (stats.duplicate_count || 0) + 1,
      }).catch(() => {});
    }
  }

  return applyXp({
    userId, category: 'penalty', amount,
    description: description || `Penalty: ${penaltyType}`, contestId,
    breakdown: [{ label: `Penalty (${penaltyType})`, amount }],
  });
}

// 6b. Copyright report — penalty + flag
export async function recordCopyrightReport(userId, contestId, description) {
  await flagSuspiciousUser(userId, description || 'Copyright complaint', 'high');
  return awardPenalty({ userId, penaltyType: 'copyright', contestId, description });
}

// 6c. Spam detection — penalty + flag
export async function recordSpamDetection(userId, contestId, description) {
  await flagSuspiciousUser(userId, description || 'Spam detected', 'medium');
  return awardPenalty({ userId, penaltyType: 'spam', contestId, description });
}

// 6d. Rule violation — penalty + flag
export async function recordRuleViolation(userId, contestId, description) {
  await flagSuspiciousUser(userId, description || 'Rule violation', 'medium');
  return awardPenalty({ userId, penaltyType: 'rule_violation', contestId, description });
}

// 7. Contest Completed — small completion bonus + finalize abandoned detection
export async function awardContestCompletedXp({ userId, contestId, contestTitle, submitted }) {
  if (!submitted) {
    // No-show → abandonment penalty
    return awardPenalty({ userId, penaltyType: 'abandonment', contestId, description: `No submission for: ${contestTitle}` });
  }
  // Submitted + completed → small completion bonus
  return applyXp({
    userId, category: 'result', amount: 15,
    description: `Contest completed: ${contestTitle}`, contestId,
    resultType: 'accepted',
    breakdown: [{ label: 'Contest Completion', amount: 15 }],
  });
}

// 8. Withdrawal Approved → wallet/payout XP
export async function awardWithdrawalApprovedXp(userId, amount) {
  return applyXp({
    userId, category: 'result', amount: WITHDRAWAL_XP.approved,
    description: `Withdrawal approved: ${amount}`, contestId: '',
    breakdown: [{ label: 'Withdrawal Approved', amount: WITHDRAWAL_XP.approved }],
  });
}

// 9. Account Suspended — heavy penalty + trust reset
export async function recordAccountSuspension(userId, reason) {
  const stats = await getOrCreateCreatorStats(userId);
  if (stats) {
    await base44.entities.CreatorStats.update(stats.id, {
      account_trust: 0,
      penalties: (stats.penalties || 0) + 1,
    }).catch(() => {});
  }
  return applyXp({
    userId, category: 'penalty', amount: -500,
    description: `Account suspended: ${reason || 'policy violation'}`, contestId: '',
    breakdown: [{ label: 'Account Suspension', amount: -500 }],
  });
}

// ============================================================================
// CENTRAL EVENT DISPATCHER — single entry point the UI calls. Routes to the
// correct handler automatically so flows stay thin.
// ============================================================================
const EVENT_HANDLERS = {
  contest_joined: (e) => awardJoinXp(e.userId, e.contestId, e.contestTitle),
  contest_withdrawn: (e) => awardWithdrawXp(e.userId, e.contestId, e.contestTitle),
  submission_uploaded: (e) => awardSubmitXp(e.userId, e.contestId, e.contestTitle, e.submittedAt, e.deadline),
  submission_updated: (e) => awardSubmissionUpdateXp(e.userId, e.contestId, e.contestTitle),
  submission_before_deadline: (e) => awardSubmitXp(e.userId, e.contestId, e.contestTitle, e.submittedAt, e.deadline),
  submission_after_deadline: (e) => awardSubmitXp(e.userId, e.contestId, e.contestTitle, e.submittedAt, e.deadline),
  winner_selected: (e) => awardContestOutcome({ userId: e.userId, contestId: e.contestId, contestTitle: e.contestTitle, resultType: 'winner', rating: e.rating }),
  runner_up_selected: (e) => awardRunnerUpXp({ userId: e.userId, contestId: e.contestId, contestTitle: e.contestTitle, rating: e.rating }),
  top5_selected: (e) => awardContestOutcome({ userId: e.userId, contestId: e.contestId, contestTitle: e.contestTitle, resultType: 'top5' }),
  client_rating_submitted: (e) => awardContestOutcome({ userId: e.userId, contestId: e.contestId, contestTitle: e.contestTitle, resultType: 'accepted', rating: e.rating }),
  client_review_submitted: (e) => awardContestOutcome({ userId: e.userId, contestId: e.contestId, contestTitle: e.contestTitle, resultType: 'accepted', rating: e.rating }),
  ai_quality_completed: (e) => awardAiQualityXp({ userId: e.userId, contestId: e.contestId, contestTitle: e.contestTitle, qualityScore: e.qualityScore }),
  copyright_report: (e) => recordCopyrightReport(e.userId, e.contestId, e.description),
  spam_detected: (e) => recordSpamDetection(e.userId, e.contestId, e.description),
  rule_violation: (e) => recordRuleViolation(e.userId, e.contestId, e.description),
  contest_completed: (e) => awardContestCompletedXp({ userId: e.userId, contestId: e.contestId, contestTitle: e.contestTitle, submitted: e.submitted }),
  withdrawal_approved: (e) => awardWithdrawalApprovedXp(e.userId, e.amount),
  account_suspended: (e) => recordAccountSuspension(e.userId, e.reason),
};

export async function processEvent(eventType, eventData) {
  const handler = EVENT_HANDLERS[eventType];
  if (!handler) return null;
  try {
    return await handler(eventData);
  } catch (e) {
    return null;
  }
}

// ============================================================================
// PREMIUM CONTEST ACCESS CHECK
// ============================================================================
export function canAccessPremiumContest(stats, requirements) {
  if (!stats) return { allowed: false, reason: 'No stats available' };
  if (requirements.minLevel && (stats.level || 1) < requirements.minLevel) {
    return { allowed: false, reason: `Requires Level ${requirements.minLevel}` };
  }
  if (requirements.minReputation && (stats.reputation_score || 0) < requirements.minReputation) {
    return { allowed: false, reason: `Requires Reputation ${requirements.minReputation}` };
  }
  if (requirements.verified && (stats.level || 1) < 20) {
    return { allowed: false, reason: 'Requires Verified account (Level 20+)' };
  }
  if (requirements.minTrust && (stats.account_trust ?? 50) < requirements.minTrust) {
    return { allowed: false, reason: `Requires Account Trust ${requirements.minTrust}` };
  }
  return { allowed: true };
}

// ============================================================================
// ANALYTICS — aggregate trends for the profile
// ============================================================================
export async function getCreatorAnalytics(userId) {
  if (!userId) return null;
  const [transactions, statsArr, badges] = await Promise.all([
    base44.entities.XpTransaction.filter({ user_id: userId }, '-created_date', 200).catch(() => []),
    base44.entities.CreatorStats.filter({ user_id: userId }, '-created_date', 1).catch(() => []),
    getUserBadges(userId).catch(() => []),
  ]);
  const stats = statsArr[0] || null;
  const totalXp = stats?.total_xp || 0;

  // XP history (last 30 entries)
  const xpHistory = transactions.slice(0, 30).map((t) => ({
    date: t.created_date, amount: t.amount, category: t.category, description: t.description,
  }));

  // Performance trend — XP per category
  const byCategory = {};
  for (const t of transactions) {
    byCategory[t.category] = (byCategory[t.category] || 0) + (t.amount || 0);
  }

  // Rating trend
  const ratings = transactions.filter((t) => t.rating > 0).map((t) => t.rating);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  // Win rate / completion rate
  const joined = stats?.contests_joined || 0;
  const submitted = stats?.contests_submitted || 0;
  const won = stats?.contests_won || 0;
  const winRate = joined > 0 ? (won / joined) * 100 : 0;
  const completionRate = joined > 0 ? (submitted / joined) * 100 : 0;
  const successRate = submitted > 0 ? (won / submitted) * 100 : 0;

  return {
    stats,
    totalXp,
    level: stats?.level || 1,
    rank: getRankName(stats?.level || 1),
    xpHistory,
    byCategory,
    avgRating,
    winRate,
    completionRate,
    successRate,
    badges,
    badgeCount: badges.length,
    transactionCount: transactions.length,
  };
}