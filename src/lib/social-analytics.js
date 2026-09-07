// Centralized social analytics engine — pure functions over synced SocialMetric / SocialPost
// records. Never fabricates: returns null when the underlying data is insufficient.

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
const hasVal = (v) => v !== null && v !== undefined && !Number.isNaN(v);

export const sortByDate = (rows, field = 'metric_date') => [...rows].sort((a, b) => new Date(a[field]) - new Date(b[field]));

export function latestMetric(metrics) {
  if (!metrics?.length) return null;
  return sortByDate(metrics)[metrics.length - 1];
}

export function windowMetrics(metrics, days) {
  const cut = Date.now() - days * 86400000;
  return (metrics || []).filter((m) => new Date(m.metric_date).getTime() >= cut);
}

// Growth of a field across the earliest→latest snapshot. null if <2 points or base is 0.
export function calculateFollowerGrowth(metrics, field = 'followers') {
  const s = sortByDate((metrics || []).filter((m) => hasVal(m[field])));
  if (s.length < 2) return null;
  const first = num(s[0][field]);
  const last = num(s[s.length - 1][field]);
  if (!first) return null;
  return { absolute: last - first, percent: Math.round(((last - first) / first) * 1000) / 10, from: first, to: last };
}

export const sumField = (rows, field) => (rows || []).reduce((s, r) => s + num(r[field]), 0);

export function average(rows, field) {
  const v = (rows || []).filter((r) => hasVal(r[field]));
  return v.length ? Math.round(sumField(v, field) / v.length) : null;
}

// Engagement rate for a single post: (likes+comments+shares+saves) / (reach|impressions|views).
export function calculateEngagementRate(post) {
  const base = num(post.reach) || num(post.impressions) || num(post.views);
  if (!base) return null;
  const eng = num(post.likes) + num(post.comments) + num(post.shares) + num(post.saves);
  return Math.round((eng / base) * 1000) / 10;
}

export function topContent(posts, n = 5) {
  return [...(posts || [])]
    .sort((a, b) => (num(b.views) || num(b.reach) || num(b.likes)) - (num(a.views) || num(a.reach) || num(a.likes)))
    .slice(0, n);
}

// byProvider: { instagram: { views, engagement_rate, followers }, ... } → best provider key by views.
export function bestPerformingPlatform(byProvider) {
  const entries = Object.entries(byProvider || {});
  if (!entries.length) return null;
  return entries.sort((a, b) => num(b[1].views) - num(a[1].views))[0][0];
}

// Aggregate a creator's latest snapshot per provider into a comparison-friendly shape.
export function summarizeConnections(connections, metricsByConn) {
  const byProvider = {};
  for (const c of connections || []) {
    const latest = latestMetric(metricsByConn?.[c.id] || []);
    if (!latest) continue;
    byProvider[c.provider] = {
      followers: num(latest.followers) || num(latest.subscriber_count),
      views: num(latest.views) || num(latest.video_views),
      engagement_rate: hasVal(latest.engagement_rate) ? latest.engagement_rate : null,
      growth: calculateFollowerGrowth(metricsByConn[c.id], latest.followers != null ? 'followers' : 'subscriber_count'),
    };
  }
  return byProvider;
}

// Row builder for the client-side creator comparison table.
export function creatorComparisonRow(name, byProvider) {
  const providers = Object.values(byProvider || {});
  const followers = providers.reduce((s, p) => s + num(p.followers), 0);
  const views = providers.reduce((s, p) => s + num(p.views), 0);
  const engs = providers.map((p) => p.engagement_rate).filter(hasVal);
  const growths = providers.map((p) => p.growth?.percent).filter(hasVal);
  return {
    name,
    followers,
    views,
    engagement_rate: engs.length ? Math.round((engs.reduce((s, e) => s + e, 0) / engs.length) * 10) / 10 : null,
    growth: growths.length ? Math.round((growths.reduce((s, g) => s + g, 0) / growths.length) * 10) / 10 : null,
  };
}
