// Platform configuration model — ONE reusable submission engine driven by data.
// Adding a platform = adding a config object here; the PlatformStep renderer
// handles every field type generically. No per-platform UI components.

// Field types the renderer supports:
//  url       — validated link (pattern-checked, http/https)
//  caption   — textarea with character count
//  textarea  — long text with character count
//  text      — single-line text
//  hashtags  — text tuned for hashtag lists
//  mentions  — text tuned for @handle lists
//  image     — optional cover/thumbnail upload
//  select    — choice list
//
// `notPublishedAllowed` on a url field enables the "Not published yet" option.
// Required-ness of url/caption/hashtags/mentions comes from contest requirements,
// resolved in requirements.js via fieldRequired().

export const PLATFORMS = [
  {
    id: 'instagram',
    label: 'Instagram',
    contentTypes: ['Reel', 'Post', 'Carousel', 'Story'],
    fields: [
      { key: 'live_url', type: 'url', label: 'Instagram post URL', placeholder: 'https://www.instagram.com/reel/…', pattern: /instagram\.com/i, notPublishedAllowed: true },
      { key: 'caption', type: 'caption', label: 'Caption', charLimit: 2200 },
      { key: 'hashtags', type: 'hashtags', label: 'Hashtags', placeholder: '#brand #campaign' },
      { key: 'mentions', type: 'mentions', label: 'Mentioned accounts', placeholder: '@brandname' },
      { key: 'collaborators', type: 'text', label: 'Collaborator accounts', placeholder: '@collab1 @collab2', optional: true },
      { key: 'cover', type: 'image', label: 'Cover image', optional: true },
    ],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    contentTypes: ['TikTok Video'],
    fields: [
      { key: 'live_url', type: 'url', label: 'TikTok URL', placeholder: 'https://www.tiktok.com/@you/video/…', pattern: /tiktok\.com/i, notPublishedAllowed: true },
      { key: 'caption', type: 'caption', label: 'Caption', charLimit: 2200 },
      { key: 'hashtags', type: 'hashtags', label: 'Hashtags', placeholder: '#brand #campaign' },
      { key: 'mentions', type: 'mentions', label: 'Mentioned account', placeholder: '@brandname', optional: true },
      { key: 'cover', type: 'image', label: 'Cover image', optional: true },
    ],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    contentTypes: ['YouTube Video', 'YouTube Short'],
    fields: [
      { key: 'visibility', type: 'select', label: 'Submission visibility', options: ['Unlisted preview', 'Public submission', 'Live campaign URL'], required: true },
      { key: 'live_url', type: 'url', label: 'YouTube URL', placeholder: 'https://youtu.be/… or https://youtube.com/watch?v=…', pattern: /youtube\.com|youtu\.be/i, notPublishedAllowed: true },
      { key: 'title', type: 'text', label: 'Video title', charLimit: 100, required: true },
      { key: 'description', type: 'textarea', label: 'Description', charLimit: 5000 },
      { key: 'tags', type: 'text', label: 'Tags', placeholder: 'comma, separated, tags', optional: true },
      { key: 'thumbnail', type: 'image', label: 'Thumbnail', optional: true },
    ],
  },
  {
    id: 'facebook',
    label: 'Facebook',
    contentTypes: ['Video', 'Reel', 'Post'],
    fields: [
      { key: 'live_url', type: 'url', label: 'Facebook URL', placeholder: 'https://www.facebook.com/…', pattern: /facebook\.com|fb\.watch/i, notPublishedAllowed: true },
      { key: 'caption', type: 'caption', label: 'Caption', charLimit: 5000 },
      { key: 'mentions', type: 'mentions', label: 'Mentions', placeholder: '@brandname', optional: true },
      { key: 'hashtags', type: 'hashtags', label: 'Hashtags', placeholder: '#brand #campaign', optional: true },
      { key: 'page', type: 'text', label: 'Page / profile', placeholder: 'Your page or profile name', optional: true },
    ],
  },
  {
    id: 'x',
    label: 'X',
    contentTypes: ['Post', 'Thread'],
    fields: [
      { key: 'thread_type', type: 'select', label: 'Format', options: ['Single post', 'Thread'], required: true },
      { key: 'live_url', type: 'url', label: 'Post URL', placeholder: 'https://x.com/you/status/…', pattern: /(^|[./@])x\.com|twitter\.com/i, notPublishedAllowed: true },
      { key: 'caption', type: 'caption', label: 'Post copy', charLimit: 280 },
      { key: 'hashtags', type: 'hashtags', label: 'Hashtags', placeholder: '#brand', optional: true },
    ],
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    contentTypes: ['Video', 'Post', 'Carousel / Document'],
    fields: [
      { key: 'live_url', type: 'url', label: 'LinkedIn post URL', placeholder: 'https://www.linkedin.com/posts/…', pattern: /linkedin\.com/i, notPublishedAllowed: true },
      { key: 'caption', type: 'caption', label: 'Post copy', charLimit: 3000 },
      { key: 'company', type: 'text', label: 'Company / page', placeholder: 'Company or page name', optional: true },
      { key: 'mentions', type: 'mentions', label: 'Mentioned accounts', placeholder: '@brandname', optional: true },
    ],
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    contentTypes: ['Pin'],
    fields: [
      { key: 'live_url', type: 'url', label: 'Pin URL', placeholder: 'https://www.pinterest.com/pin/…', pattern: /pinterest\./i, notPublishedAllowed: true },
      { key: 'title', type: 'text', label: 'Title', charLimit: 100, required: true },
      { key: 'description', type: 'textarea', label: 'Description', charLimit: 500 },
      { key: 'board', type: 'text', label: 'Board', placeholder: 'Board name', optional: true },
    ],
  },
  {
    id: 'threads',
    label: 'Threads',
    contentTypes: ['Post'],
    fields: [
      { key: 'live_url', type: 'url', label: 'Threads post URL', placeholder: 'https://www.threads.net/…', pattern: /threads\.net/i, notPublishedAllowed: true },
      { key: 'caption', type: 'caption', label: 'Post copy', charLimit: 500 },
    ],
  },
  {
    id: 'other',
    label: 'Other / Custom',
    contentTypes: ['Custom'],
    customPlatform: true,
    fields: [
      { key: 'platform_name', type: 'text', label: 'Platform name', placeholder: 'e.g. Snapchat', required: true },
      { key: 'content_type_custom', type: 'text', label: 'Content type', placeholder: 'e.g. Snap Ad', required: true },
      { key: 'live_url', type: 'url', label: 'Live URL', placeholder: 'https://…', notPublishedAllowed: true },
      { key: 'description', type: 'textarea', label: 'Description', charLimit: 2000 },
    ],
  },
];

export const PLATFORMS_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

export const platformById = (id) => PLATFORMS_BY_ID[id] || null;

// The platforms a contest accepts — ordered by the contest's requirement list.
export function contestPlatforms(ids = []) {
  const valid = ids.map((id) => PLATFORMS_BY_ID[id]).filter(Boolean);
  return valid.length ? valid : PLATFORMS;
}