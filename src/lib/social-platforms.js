// ─────────────────────────────────────────────────────────────────────────────
// PERMANENT RAZEKIT SOCIAL PLATFORM REGISTRY (config-driven).
// One entry per platform. The tracker UI, dialogs, metrics, URL validation and
// dashboards render purely from this config — adding a future platform is ONE
// new entry here plus (later) a server-side provider; no UI changes needed.
// ─────────────────────────────────────────────────────────────────────────────

export const SOCIAL_PLATFORMS = [
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    icon: 'instagram',
    contentTypes: ['Reel', 'Post', 'Story', 'Carousel'],
    metrics: ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'engagement_rate'],
    urlPatterns: [/^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/i],
    webUrl: 'https://www.instagram.com/',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#111827',
    icon: 'music',
    contentTypes: ['Video', 'Photo Post', 'Story'],
    metrics: ['views', 'likes', 'comments', 'shares', 'saves'],
    urlPatterns: [
      /^https?:\/\/(www\.)?tiktok\.com\/[^\s]+\/video\/\d+/i,
      /^https?:\/\/vm\.tiktok\.com\/[A-Za-z0-9]+/i,
    ],
    webUrl: 'https://www.tiktok.com/',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    icon: 'youtube',
    contentTypes: ['Video', 'Short', 'Live'],
    metrics: ['views', 'likes', 'comments', 'shares', 'watch_time'],
    urlPatterns: [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]+/i,
      /^https?:\/\/(www\.)?youtube\.com\/shorts\/[A-Za-z0-9_-]+/i,
      /^https?:\/\/youtu\.be\/[A-Za-z0-9_-]+/i,
    ],
    webUrl: 'https://studio.youtube.com/',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    icon: 'facebook',
    contentTypes: ['Reel', 'Post', 'Video', 'Story'],
    metrics: ['views', 'reach', 'likes', 'comments', 'shares'],
    urlPatterns: [/^https?:\/\/(www\.)?facebook\.com\/[^\s]+/i],
    webUrl: 'https://www.facebook.com/',
  },
  {
    id: 'x',
    name: 'X',
    color: '#111827',
    icon: 'x',
    contentTypes: ['Post', 'Video', 'Thread'],
    metrics: ['views', 'likes', 'comments', 'shares'],
    urlPatterns: [/^https?:\/\/(www\.)?(twitter|x)\.com\/[A-Za-z0-9_]+\/status\/\d+/i],
    webUrl: 'https://x.com/compose/post',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    icon: 'linkedin',
    contentTypes: ['Post', 'Video', 'Article', 'Carousel'],
    metrics: ['impressions', 'likes', 'comments', 'shares'],
    urlPatterns: [/^https?:\/\/(www\.)?linkedin\.com\/(posts|feed\/update|pulse)\/[^\s]+/i],
    webUrl: 'https://www.linkedin.com/feed/',
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    color: '#BD081C',
    icon: 'pinterest',
    contentTypes: ['Pin', 'Idea Pin'],
    metrics: ['impressions', 'saves', 'clicks'],
    urlPatterns: [/^https?:\/\/([a-z]{2,3}\.)?pinterest\.[a-z.]+\/pin\/\d+/i],
    webUrl: 'https://www.pinterest.com/',
  },
  {
    id: 'threads',
    name: 'Threads',
    color: '#111827',
    icon: 'threads',
    contentTypes: ['Post'],
    metrics: ['views', 'likes', 'comments'],
    urlPatterns: [/^https?:\/\/(www\.)?threads\.(net|com)\/[^\s]+\/post\/[A-Za-z0-9_-]+/i],
    webUrl: 'https://www.threads.net/',
  },
  {
    id: 'other',
    name: 'Other / Custom',
    color: '#5F7597',
    icon: 'other',
    contentTypes: ['Custom'],
    metrics: ['views', 'likes', 'comments', 'shares'],
    urlPatterns: [/^https?:\/\/[^\s]+\.[^\s]+/i],
    webUrl: '',
  },
];

// Standardized metric labels (which metrics a platform supports comes from the
// platform entry — the UI renders ONLY the supported ones).
export const METRIC_DEFS = {
  views: 'Views',
  reach: 'Reach',
  impressions: 'Impressions',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  saves: 'Saves',
  clicks: 'Clicks',
  watch_time: 'Watch Time (min)',
  engagement_rate: 'Engagement Rate (%)',
};

export const platformById = (id) =>
  SOCIAL_PLATFORMS.find((p) => p.id === id) || SOCIAL_PLATFORMS[SOCIAL_PLATFORMS.length - 1];

// Live OAuth account connections are not wired yet — until a provider's OAuth
// app + server-side sync worker exist, every platform tracks MANUALLY and the UI
// must never claim a connection or auto-tracking that does not exist.
export const SOCIAL_CONNECTIONS_LIVE = false;