import { base44 } from '@/api/base44Client';

// ============================================================================
// ANTI-CHEAT ENGINE — detects XP farming, fake uploads, duplicate
// submissions, repeated low-quality work, and suspicious activity. Flags
// users automatically; no admin action required.
// ============================================================================

// Check for duplicate video URL across a user's submissions in the same contest
export async function checkDuplicateSubmission(userId, contestId, videoUrl) {
  if (!userId || !contestId || !videoUrl) return { isDuplicate: false };
  const subs = await base44.entities.Submission.filter({ contest_id: contestId }, '-created_date', 100).catch(() => []);
  const dupes = subs.filter((s) => s.video_url === videoUrl && s.created_by_id !== userId);
  if (dupes.length > 0) {
    return { isDuplicate: true, matchedSubmission: dupes[0] };
  }
  // Also check the same user re-uploading identical content to different contests
  const userSubs = await base44.entities.Submission.filter({ created_by_id: userId }, '-created_date', 200).catch(() => []);
  const selfDupes = userSubs.filter((s) => s.video_url === videoUrl && s.contest_id !== contestId);
  if (selfDupes.length > 0) {
    return { isDuplicate: true, selfPlagiarism: true };
  }
  return { isDuplicate: false };
}

// Detect XP farming patterns: high join count but very low submission rate
export function detectXpFarming(stats) {
  if (!stats) return { flagged: false };
  const joined = stats.contests_joined || 0;
  const submitted = stats.contests_submitted || 0;
  // Joined 10+ but submitted < 20% → suspicious farming of join XP
  if (joined >= 10 && submitted / joined < 0.2) {
    return { flagged: true, reason: 'Low submission rate — possible XP farming via joining', severity: 'medium' };
  }
  // Many joins, zero submissions after 5+ contests
  if (joined >= 5 && submitted === 0) {
    return { flagged: true, reason: 'Joined 5+ contests with zero submissions', severity: 'low' };
  }
  return { flagged: false };
}

// Detect repeated low-quality work
export function detectLowQualityPattern(stats) {
  if (!stats) return { flagged: false };
  const count = stats.quality_score_count || 0;
  const avg = count > 0 ? (stats.quality_score_sum || 0) / count : 100;
  if (count >= 5 && avg < 50) {
    return { flagged: true, reason: `Average quality score ${avg.toFixed(0)} across ${count} submissions`, severity: 'medium' };
  }
  return { flagged: false };
}

// Detect artificial reviews — suspiciously high ratings with very few contests
export function detectArtificialReviews(stats) {
  if (!stats) return { flagged: false };
  const reviews = stats.total_reviews || 0;
  const won = stats.contests_won || 0;
  if (reviews >= 5 && won === 0 && (stats.review_score_sum || 0) / reviews >= 4.8) {
    return { flagged: true, reason: 'High ratings with no contest wins — possible artificial reviews', severity: 'low' };
  }
  return { flagged: false };
}

// Flag a suspicious user — increments flagged_count and lowers account_trust
export async function flagSuspiciousUser(userId, reason, severity = 'medium') {
  if (!userId) return;
  const stats = await base44.entities.CreatorStats.filter({ user_id: userId }, '-created_date', 1).catch(() => []);
  if (stats.length === 0) return;
  const s = stats[0];
  const trustDeduction = severity === 'high' ? 25 : severity === 'medium' ? 12 : 5;
  const newTrust = Math.max(0, (s.account_trust ?? 50) - trustDeduction);
  await base44.entities.CreatorStats.update(s.id, {
    flagged_count: (s.flagged_count || 0) + 1,
    account_trust: newTrust,
  }).catch(() => {});

  // Also create a FraudAlert for admin visibility
  await base44.entities.FraudAlert.create({
    user_id: userId,
    alert_type: 'suspicious_ip',
    severity,
    status: 'flagged',
    details: reason,
  }).catch(() => {});
}

// Run all anti-cheat checks for a user — returns any flags raised
export async function runAntiCheatScan(userId) {
  if (!userId) return { flags: [] };
  const stats = await base44.entities.CreatorStats.filter({ user_id: userId }, '-created_date', 1).catch(() => []);
  if (stats.length === 0) return { flags: [] };
  const s = stats[0];
  const flags = [];
  const checks = [detectXpFarming(s), detectLowQualityPattern(s), detectArtificialReviews(s)];
  for (const c of checks) {
    if (c.flagged) flags.push(c);
  }
  if (flags.length > 0) {
    const top = flags.sort((a, b) => {
      const order = { high: 3, medium: 2, low: 1 };
      return order[b.severity] - order[a.severity];
    })[0];
    await flagSuspiciousUser(userId, top.reason, top.severity);
  }
  return { flags };
}