// ─────────────────────────────────────────────────────────────────────────────
// Razekit Social Tracker engine — controlled state model, URL validation,
// campaign progress derivation, metric semantics and aggregation.
// Pure derivation only: no data mutation, no fabricated values.
// ─────────────────────────────────────────────────────────────────────────────
import { SOCIAL_PLATFORMS, platformById } from './social-platforms';

// Controlled social post states (§13) — the ONLY status strings in the codebase.
export const SOCIAL_POST_STATES = [
  'PLANNED', 'CONTENT_PENDING', 'READY_FOR_REVIEW', 'APPROVED', 'SCHEDULED',
  'PUBLISHED', 'TRACKING', 'FAILED', 'REMOVED', 'ARCHIVED',
];
export const SOCIAL_POST_STATE_LABELS = {
  PLANNED: 'Planned', CONTENT_PENDING: 'Content Pending', READY_FOR_REVIEW: 'Ready for Review',
  APPROVED: 'Approved', SCHEDULED: 'Scheduled', PUBLISHED: 'Published', TRACKING: 'Tracking',
  FAILED: 'Failed', REMOVED: 'Removed', ARCHIVED: 'Archived',
};
export const SOCIAL_POST_STATE_TONES = {
  PLANNED: 'neutral', CONTENT_PENDING: 'neutral', READY_FOR_REVIEW: 'accent', APPROVED: 'info',
  SCHEDULED: 'info', PUBLISHED: 'success', TRACKING: 'success', FAILED: 'danger',
  REMOVED: 'neutral', ARCHIVED: 'neutral',
};

export const CONTENT_SOURCE_LABELS = {
  creator_submission: 'Creator Submission',
  winner_content: 'Winner Content',
  collaboration_content: 'Collaboration Content',
  brand_upload: 'Brand Uploaded',
  custom_asset: 'Custom Campaign Asset',
};

export const PUBLISHED_LIKE = ['PUBLISHED', 'TRACKING'];

export const safeJson = (raw, fallback) => {
  if (raw == null || raw === '') return fallback;
  try { const v = JSON.parse(raw); return v ?? fallback; } catch { return fallback; }
};

// URL validation per platform registry (§49) — no overclaimed validity.
export function validatePlatformUrl(platformId, url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return { valid: false, message: 'Enter the live post URL.' };
  const p = platformById(platformId);
  const ok = (p.urlPatterns || []).some((re) => re.test(trimmed));
  return ok
    ? { valid: true, message: '' }
    : { valid: false, message: `This URL does not appear to be a valid ${p.name} post.` };
}

// Platforms this contest expects content on, derived from its deliverables.
export function contestDestinations(contest) {
  const deliverables = safeJson(contest?.deliverables, []);
  if (!Array.isArray(deliverables)) return [];
  const seen = new Set();
  const out = [];
  deliverables.forEach((d) => {
    const id = d?.platform;
    if (!id || seen.has(id)) return;
    const p = SOCIAL_PLATFORMS.find((x) => x.id === id);
    if (!p) return;
    seen.add(id);
    out.push({ platform: id, label: d.content_type || d.name || p.contentTypes[0] });
  });
  return out;
}

// Per-platform progress for one contest's campaign (posts + expected destinations).
export function campaignProgress(contest, posts = []) {
  const ids = new Set(contestDestinations(contest).map((d) => d.platform));
  posts.forEach((post) => ids.add(post.platform));
  const platforms = [...ids].map((id) => {
    const mine = posts.filter((p) => p.platform === id);
    const published = mine.filter((p) => PUBLISHED_LIKE.includes(p.status)).length;
    return { platform: id, total: mine.length, published, pending: mine.length - published };
  });
  const expected = contestDestinations(contest).length || platforms.length;
  const publishedPlatforms = platforms.filter((p) => p.published > 0).length;
  return { platforms, total: platforms.length, publishedPlatforms, complete: expected > 0 && publishedPlatforms >= expected };
}

// Metric semantics (§25): available / not tracked (supported but no value yet)
// / not available (platform doesn't support the metric). NEVER fake zeros.
export function getPostMetric(post, key) {
  const p = platformById(post?.platform);
  if (!(p.metrics || []).includes(key)) return { state: 'not_available' };
  const m = safeJson(post?.metrics, {});
  const v = m[key];
  if (v == null || v === '') return { state: 'not_tracked' };
  return { state: 'available', value: Number(v) };
}

export function hasMetrics(post) {
  const m = safeJson(post?.metrics, {});
  return Object.values(m).some((v) => v != null && v !== '');
}

// Engagement: stored rate when supported, else computed from real views+interactions.
export function engagementOf(post) {
  const er = getPostMetric(post, 'engagement_rate');
  if (er.state === 'available') return er;
  const parts = ['likes', 'comments', 'shares'].map((k) => getPostMetric(post, k));
  const views = getPostMetric(post, 'views');
  const interactions = parts.filter((r) => r.state === 'available').reduce((s, r) => s + r.value, 0);
  const anyTracked = parts.some((r) => r.state === 'available') || views.state === 'available';
  if (views.state === 'available' && views.value > 0 && interactions > 0) {
    return { state: 'available', value: Math.round((interactions / views.value) * 1000) / 10 };
  }
  return { state: anyTracked ? 'not_tracked' : 'not_available' };
}

// Campaign totals (§27): only semantically compatible metrics are summed, and
// only from posts that actually have values.
const SUMMABLE = ['views', 'likes', 'comments', 'shares'];
export function campaignTotals(posts = []) {
  const totals = Object.fromEntries(SUMMABLE.map((k) => [k, 0]));
  const published = posts.filter((p) => PUBLISHED_LIKE.includes(p.status));
  published.forEach((post) => {
    SUMMABLE.forEach((k) => {
      const r = getPostMetric(post, k);
      if (r.state === 'available') totals[k] += r.value;
    });
  });
  return {
    totals,
    publishedCount: published.length,
    platformsActive: new Set(published.map((p) => p.platform)).size,
    anyViewsTracked: published.some((p) => getPostMetric(p, 'views').state === 'available'),
  };
}

// Appends one real snapshot to the post's history and sets latest metrics.
export function buildMetricUpdate(post, values, source = 'manual') {
  const clean = {};
  Object.entries(values || {}).forEach(([k, v]) => {
    if (v !== '' && v != null && !Number.isNaN(Number(v))) clean[k] = Number(v);
  });
  const history = safeJson(post?.metric_history, []);
  if (!Array.isArray(history)) return { metrics: JSON.stringify(clean), metric_history: JSON.stringify([]) };
  history.push({ at: new Date().toISOString(), source, values: clean });
  return {
    metrics: JSON.stringify(clean),
    metric_history: JSON.stringify(history),
    last_checked_at: new Date().toISOString(),
  };
}

// The social layer's next action for a contest — only from ACTUAL state (§36).
export function socialNextAction(contest, posts = []) {
  if (!contest || !['winner_selected', 'completed'].includes(contest.status)) return null;
  const progress = campaignProgress(contest, posts);
  if (progress.total === 0) return null;
  if (progress.publishedPlatforms < progress.total) {
    return {
      label: 'Finish social publishing',
      hint: `${progress.total - progress.publishedPlatforms} platform destination${progress.total - progress.publishedPlatforms === 1 ? '' : 's'} still pending.`,
      to: '/social',
      priority: 2,
    };
  }
  if (posts.some((p) => PUBLISHED_LIKE.includes(p.status) && !hasMetrics(p))) {
    return { label: 'Update performance metrics', hint: 'Published posts are waiting for their first metric snapshot.', to: '/social', priority: 3 };
  }
  return null;
}

export function timeAgo(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

export function formatMetric(value) {
  if (value == null) return '—';
  if (Math.abs(value) >= 1e7) return `${(value / 1e7).toFixed(1)}Cr`;
  if (Math.abs(value) >= 1e5) return `${(value / 1e5).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value * 10) / 10);
}