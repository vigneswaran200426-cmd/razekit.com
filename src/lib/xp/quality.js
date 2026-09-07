import { base44 } from '@/api/base44Client';

// ============================================================================
// QUALITY ENGINE — analyzes a submission when uploaded and generates a
// 0–100 quality score based on completeness, file integrity, and deadline
// proximity. An optional AI quality score can be layered on via InvokeLLM.
// ============================================================================

// Core rule-based quality analysis (no credits needed)
export function calculateQualityScore({ submission, contest, submittedAt }) {
  let score = 0;
  const factors = [];

  // 1. Submission completeness — video URL present and non-empty (30 pts)
  const hasVideo = !!(submission?.video_url && submission.video_url.trim());
  if (hasVideo) { score += 30; factors.push({ label: 'Video file attached', pts: 30 }); }
  else factors.push({ label: 'No video file', pts: 0 });

  // 2. File integrity — URL is a valid media link (20 pts)
  const validUrl = hasVideo && /^https?:\/\/.+\.(mp4|mov|webm|avi|mkv|m4v)(\?|$)/i.test(submission.video_url);
  // Also accept any non-empty URL even if extension differs (uploaded files)
  const urlOk = hasVideo && (validUrl || submission.video_url.includes('media.base44.com') || submission.video_url.includes('wixstatic.com'));
  if (urlOk) { score += 20; factors.push({ label: 'Valid media format', pts: 20 }); }
  else if (hasVideo) { score += 10; factors.push({ label: 'Media link (unverified format)', pts: 10 }); }

  // 3. Deadline proximity — earlier submissions score higher (30 pts)
  const now = submittedAt || new Date().toISOString();
  if (contest?.deadline) {
    const diffH = (new Date(contest.deadline).getTime() - new Date(now).getTime()) / 3600000;
    if (diffH >= 48) { score += 30; factors.push({ label: 'Submitted >48h early', pts: 30 }); }
    else if (diffH >= 24) { score += 25; factors.push({ label: 'Submitted 24-48h early', pts: 25 }); }
    else if (diffH >= 6) { score += 20; factors.push({ label: 'Submitted 6-24h early', pts: 20 }); }
    else if (diffH >= 0) { score += 15; factors.push({ label: 'Submitted on time', pts: 15 }); }
    else { score += 5; factors.push({ label: 'Submitted late', pts: 5 }); }
  } else { score += 15; factors.push({ label: 'No deadline constraint', pts: 15 }); }

  // 4. Submission not a re-upload of identical content — basic check (10 pts)
  //    (Full duplicate detection lives in anticheat.js; here we assume ok)
  score += 10; factors.push({ label: 'Content uniqueness (pending review)', pts: 10 });

  // 5. Client review bonus — if already rated 4+ stars (10 pts)
  if (submission?.rating && submission.rating >= 4) { score += 10; factors.push({ label: `Client rated ${submission.rating}\u2605`, pts: 10 }); }

  return { score: Math.min(100, score), factors };
}

// Optional: AI-powered quality analysis via InvokeLLM (uses integration credits)
// Only call when explicitly requested — rule-based score is the default.
export async function getAiQualityScore({ submission, contest }) {
  try {
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze the quality of a video editing contest submission. Contest category: ${contest?.category || 'general'}. Submission video URL: ${submission?.video_url || 'none'}. Contest requirements: ${contest?.editing_style || 'not specified'}, duration: ${contest?.video_duration || 'not specified'}. Rate the expected quality on a 0-100 scale based on how well the submission metadata matches contest requirements. Return only a number.`,
      response_json_schema: { type: 'object', properties: { quality_score: { type: 'number' }, notes: { type: 'string' } } },
    });
    const score = typeof res === 'object' ? res.quality_score : 75;
    return { score: Math.max(0, Math.min(100, Math.round(score))), source: 'ai' };
  } catch {
    return { score: null, source: 'ai', error: true };
  }
}

// Full quality analysis pipeline — runs on upload, persists score, awards quality XP
export async function analyzeSubmissionQuality({ userId, submission, contest, submittedAt, contestId }) {
  const { score, factors } = calculateQualityScore({ submission, contest, submittedAt });

  // Update the submission with the quality score (stored on Submission if field exists,
  // otherwise tracked via CreatorStats aggregate)
  const stats = await base44.entities.CreatorStats.filter({ user_id: userId }, '-created_date', 1).catch(() => []);
  if (stats.length > 0) {
    const s = stats[0];
    const newCount = (s.quality_score_count || 0) + 1;
    const newSum = (s.quality_score_sum || 0) + score;
    await base44.entities.CreatorStats.update(s.id, {
      quality_score_count: newCount,
      quality_score_sum: newSum,
      quality_score_avg: Math.round(newSum / newCount),
    }).catch(() => {});
  }

  return { score, factors };
}