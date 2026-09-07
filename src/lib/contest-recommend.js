// Transparent, rule-based contest recommendations for creators (§10).
// Deliberately simple and extensible: each signal has an explainable score.
// Can later be replaced by a smarter ranker without touching the UI.
import { safeJson } from './social-tracker';

const norm = (s) => (s || '').toLowerCase();
const tokens = (s) => (norm(s).split(/[,/|]/)).map((t) => t.trim()).filter(Boolean);

export function recommendContests({ contests = [], submissions = [], profile = null, limit = 4 }) {
  const joined = new Set(submissions.map((s) => s.contest_id));
  const interests = [...tokens(profile?.categories), ...tokens(profile?.skills)];
  const platformHistory = new Set(submissions.map((s) => s.platform).filter(Boolean));
  const now = Date.now();

  return contests
    .filter((c) => c.status === 'open' && !joined.has(c.id) && new Date(c.deadline).getTime() > now)
    .map((c) => {
      let score = 1;
      // 1. Category / style match with the creator's declared interests.
      if (interests.some((i) => i && [c.category, c.editing_style, c.title, c.description].some((f) => norm(f).includes(i)))) score += 3;
      // 2. Platform overlap with the creator's own submission history.
      const destPlatforms = safeJson(c.deliverables, []).map((d) => d?.platform).filter(Boolean);
      if (destPlatforms.some((p) => platformHistory.has(p))) score += 2;
      // 3. Closing soon — decide before it's gone.
      const daysLeft = (new Date(c.deadline).getTime() - now) / 86400000;
      if (daysLeft <= 7) score += 1;
      return { contest: c, score };
    })
    .sort((a, b) => b.score - a.score || (b.contest.prize_amount || 0) - (a.contest.prize_amount || 0))
    .slice(0, limit)
    .map((r) => r.contest);
}