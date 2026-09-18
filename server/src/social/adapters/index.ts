// The adapter registry, and the capability matrix the product reads.
//
// Everything that wants to know "can RazeKit measure X on platform Y" asks here
// rather than hardcoding an assumption. That is what stops the Tracker
// rendering a Saves column for Reddit, which has no such concept.
import { instagramAdapter } from './instagram.js';
import { threadsAdapter } from './threads.js';
import { tiktokAdapter } from './tiktok.js';
import { youtubeAdapter } from './youtube.js';
import { xAdapter } from './x.js';
import { redditAdapter } from './reddit.js';
import {
  METRIC_NAMES, SOCIAL_PLATFORMS,
  type MetricName, type SocialAdapter, type SocialPlatform,
} from './types.js';

const ADAPTERS: Record<SocialPlatform, SocialAdapter> = {
  instagram: instagramAdapter,
  threads: threadsAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
  x: xAdapter,
  reddit: redditAdapter,
};

export function adapterFor(platform: string): SocialAdapter | null {
  const key = String(platform || '').trim().toLowerCase();
  const alias: Record<string, SocialPlatform> = {
    instagram: 'instagram', instagram_reels: 'instagram',
    threads: 'threads',
    tiktok: 'tiktok',
    youtube: 'youtube', youtube_shorts: 'youtube',
    x: 'x', twitter: 'x',
    reddit: 'reddit',
  };
  const p = alias[key];
  return p ? ADAPTERS[p] : null;
}

export const allAdapters = (): SocialAdapter[] => SOCIAL_PLATFORMS.map((p) => ADAPTERS[p]);

/** Platforms this deployment can actually talk to right now. */
export const configuredPlatforms = (): SocialPlatform[] =>
  SOCIAL_PLATFORMS.filter((p) => ADAPTERS[p].configured());

export interface PlatformCapabilityRow {
  platform: SocialPlatform;
  apiName: string;
  configured: boolean;
  metrics: Record<MetricName, { supported: boolean; apiField: string; notes: string }>;
}

/**
 * The whole matrix, for the admin diagnostics screen and for the Tracker to
 * decide which columns exist at all.
 *
 * Deliberately includes unsupported metrics with their reason: "Reddit has no
 * watch time" is information a brand planning a campaign needs, and hiding the
 * row entirely would leave them guessing why the column moved.
 */
export function capabilityMatrix(): PlatformCapabilityRow[] {
  return allAdapters().map((a) => {
    const metrics = {} as PlatformCapabilityRow['metrics'];
    for (const name of METRIC_NAMES) {
      const cap = a.capabilities.find((c) => c.metric === name);
      metrics[name] = cap
        ? { supported: cap.supported, apiField: cap.apiField, notes: cap.notes }
        : { supported: false, apiField: '', notes: 'Not declared by this adapter.' };
    }
    return { platform: a.platform, apiName: a.apiName, configured: a.configured(), metrics };
  });
}

export * from './types.js';
export { instagramAdapter, threadsAdapter, tiktokAdapter, youtubeAdapter, xAdapter, redditAdapter };
