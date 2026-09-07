import { base44 } from '@/api/base44Client';

// ─────────────────────────────────────────────────────────────────────────────
// Razekit reputation system — verified, two-sided reviews.
// A review exists only after a REAL completed interaction (contest won & paid).
// Reputation = average review score + number of verified reviews. No XP, no levels.
// ─────────────────────────────────────────────────────────────────────────────

// Configurable review window (days) after contest completion.
export const REVIEW_WINDOW_DAYS = 14;

// Categories used when a CLIENT reviews a CREATOR.
export const REVIEW_CATEGORIES = [
  { key: 'content_quality', label: 'Content Quality' },
  { key: 'communication', label: 'Communication' },
  { key: 'reliability', label: 'Reliability' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'professionalism', label: 'Professionalism' },
];

// Categories used when a CREATOR reviews a CLIENT.
export const CLIENT_REVIEW_CATEGORIES = [
  { key: 'brief_quality', label: 'Brief Quality' },
  { key: 'communication', label: 'Communication' },
  { key: 'fairness', label: 'Fairness' },
  { key: 'payment_experience', label: 'Payment Experience' },
  { key: 'professionalism', label: 'Professionalism' },
];

const round1 = (n) => Math.round(n * 10) / 10;

// Reviews about a CREATOR (written by clients).
export async function getCreatorReviews(creatorId) {
  if (!creatorId) return [];
  const all = await base44.entities.Review.filter({ creator_id: creatorId, status: 'published' }, '-created_date', 100).catch(() => []);
  return all.filter((r) => (r.reviewer_role || 'client') === 'client');
}

// Reviews about a CLIENT (written by winning creators).
export async function getClientReviews(clientId) {
  if (!clientId) return [];
  const all = await base44.entities.Review.filter({ client_id: clientId, status: 'published' }, '-created_date', 100).catch(() => []);
  return all.filter((r) => r.reviewer_role === 'creator');
}

export function summarizeReviews(reviews = [], categories = REVIEW_CATEGORIES) {
  const count = reviews.length;
  if (!count) return { count: 0, average: 0, distribution: [0, 0, 0, 0, 0], categories: {}, wouldWorkAgainPct: 0 };
  const average = round1(reviews.reduce((s, r) => s + (r.overall_rating || 0), 0) / count);
  const distribution = [0, 0, 0, 0, 0]; // index 0 = 1 star … index 4 = 5 stars
  reviews.forEach((r) => { const v = Math.round(r.overall_rating || 0); if (v >= 1 && v <= 5) distribution[v - 1]++; });
  const cats = {};
  categories.forEach((c) => { cats[c.key] = round1(reviews.reduce((s, r) => s + (r[c.key] || 0), 0) / count); });
  const wouldWorkAgainPct = Math.round((reviews.filter((r) => r.would_work_again).length / count) * 100);
  return { count, average, distribution, categories: cats, wouldWorkAgainPct };
}

// ── One review per relationship, per direction ──
export async function hasClientReviewedCreator(clientId, contestId) {
  if (!clientId || !contestId) return false;
  const existing = await base44.entities.Review.filter({ client_id: clientId, contest_id: contestId, reviewer_role: 'client' }, '-created_date', 1).catch(() => []);
  return existing.length > 0;
}

export async function hasCreatorReviewedClient(creatorId, contestId) {
  if (!creatorId || !contestId) return false;
  const existing = await base44.entities.Review.filter({ creator_id: creatorId, contest_id: contestId, reviewer_role: 'creator' }, '-created_date', 1).catch(() => []);
  return existing.length > 0;
}

// Legacy alias (client → creator direction).
export const hasReviewed = hasClientReviewedCreator;

// ── Review window (configurable) ──
export function reviewWindowOpen(contest) {
  if (!contest) return false;
  const completedAt = contest.completed_at || contest.winner_selected_at;
  if (!completedAt) return ['winner_selected', 'completed'].includes(contest.status);
  const deadlineMs = new Date(completedAt).getTime() + REVIEW_WINDOW_DAYS * 86400000;
  return Date.now() <= deadlineMs;
}

// ── Eligibility: real, completed interactions only ──
// A client may review the winning creator of their OWN completed contest, once, within the window.
export function canClientReview({ me, contest }) {
  if (!me || me.user_role !== 'client' || !contest) return false;
  if (contest.created_by_id !== me.id) return false;
  if (!contest.winner_user_id) return false;
  if (!['winner_selected', 'completed'].includes(contest.status)) return false;
  return reviewWindowOpen(contest);
}

// The winning creator may review the client of that contest, once, within the window.
export function canWinnerReviewClient({ me, contest }) {
  if (!me || !contest) return false;
  if (contest.winner_user_id !== me.id) return false;
  if (!['winner_selected', 'completed'].includes(contest.status)) return false;
  return reviewWindowOpen(contest);
}

// Compact display helpers used across cards and profiles.
export function ratingLabel(average) {
  return average ? round1(average).toFixed(1) : '—';
}