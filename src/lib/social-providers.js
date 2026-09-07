// Razekit native social provider abstraction.
// NO scraping, NO private APIs. Real data requires official OAuth apps + a
// server-side sync worker holding secrets (see SETUP). The frontend never calls
// providers directly and never holds tokens.

export const SOCIAL_PROVIDERS = [
  { key: 'instagram', name: 'Instagram', color: '#E4405F', oauth: true, metrics: ['followers', 'reach', 'impressions', 'likes', 'comments', 'shares', 'saves', 'video_views', 'profile_visits', 'engagement_rate'] },
  { key: 'youtube', name: 'YouTube', color: '#FF0000', oauth: true, metrics: ['subscriber_count', 'views', 'likes', 'comments', 'watch_time', 'engagement_rate'] },
  { key: 'tiktok', name: 'TikTok', color: '#111111', oauth: true, metrics: ['followers', 'video_views', 'likes', 'comments', 'shares', 'engagement_rate'] },
  { key: 'facebook', name: 'Facebook', color: '#1877F2', oauth: true, metrics: ['followers', 'reach', 'impressions', 'likes', 'comments', 'shares', 'engagement_rate'] },
  { key: 'linkedin', name: 'LinkedIn', color: '#0A66C2', oauth: true, metrics: ['followers', 'impressions', 'likes', 'comments', 'shares', 'engagement_rate'] },
  { key: 'x', name: 'X', color: '#111111', oauth: true, metrics: ['followers', 'views', 'likes', 'comments', 'shares', 'engagement_rate'] },
];

export const providerByKey = (k) => SOCIAL_PROVIDERS.find((p) => p.key === k) || null;

// Metrics the normalized model can hold; provider-specific extras live in provider_metadata.
export const NORMALIZED_METRICS = ['followers', 'following', 'subscriber_count', 'views', 'video_views', 'reach', 'impressions', 'likes', 'comments', 'shares', 'saves', 'watch_time', 'profile_visits', 'engagement_rate'];

export const providerSupports = (providerKey, metric) => {
  const p = providerByKey(providerKey);
  return !!p && p.metrics.includes(metric);
};

// The adapter contract each provider implements SERVER-SIDE once its OAuth app exists.
// (Interface only — no implementation here; the browser must not perform these.)
export const SOCIAL_ADAPTER_METHODS = ['connect', 'refreshToken', 'getProfile', 'getAccountMetrics', 'getPosts', 'getPostMetrics', 'disconnect', 'handleWebhook', 'sync'];

// Whether live OAuth + sync is configured. False until per-provider OAuth apps and a
// server-side sync service are wired via env/secrets. Gate all "real connect" UI on this.
export const SOCIAL_LIVE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SOCIAL_LIVE === 'true') || false;
