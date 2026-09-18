// Metric sync for one submitted post.
//
// The gate this enforces: RazeKit reads metrics for a creator's post ONLY when
// that creator has authorized that platform, and only after the provider has
// confirmed the post is actually theirs. Every other path produces a stated
// reason, never a number.
//
// The outcomes, and why they are distinct:
//
//   not_connected      the creator never authorized this platform. Nothing is
//                      wrong; there is simply nothing to read.
//   needs_reconnect    they did, and the token has since been rejected.
//   not_owned          the provider says this post belongs to someone else.
//                      Recorded, never scored, and never phrased to the creator
//                      as an accusation.
//   unavailable        the provider failed or rate limited us this time.
//   synced             real numbers, with provenance.
//
// A brand reading a campaign needs to tell these apart. Collapsing any of them
// into "0 views" is the failure this module exists to prevent.
import { serviceClient } from '../entities/service.js';
import { adapterFor } from './adapters/index.js';
import { AdapterError, hasValue, type MetricName, type MetricValue, type SocialPlatform } from './adapters/types.js';
import { credentialsFor } from './connect.js';
import { parsePublicationUrl } from './publication.js';

export type SyncOutcome =
  | 'synced' | 'not_connected' | 'needs_reconnect' | 'not_owned'
  | 'unsupported_platform' | 'unavailable' | 'no_url';

export interface SyncResult {
  outcome: SyncOutcome;
  platform?: SocialPlatform;
  providerPostId?: string;
  /** Present only on `synced`. */
  metrics?: Partial<Record<MetricName, MetricValue>>;
  retrievedAt?: string;
  /** Human-readable, safe to show a creator. Never accusatory. */
  message: string;
}

/**
 * How long a freshly-synced post is considered current.
 *
 * Providers meter reads — X bills per request, Reddit shares 100 QPM across
 * every creator — so a cooldown is a cost control as much as a politeness.
 */
export const SYNC_COOLDOWN_MS = 30 * 60 * 1000;

export function isFresh(lastSyncedAt: unknown, now = Date.now()): boolean {
  const t = Date.parse(String(lastSyncedAt || ''));
  return Number.isFinite(t) && now - t < SYNC_COOLDOWN_MS;
}

/** Turn a submitted URL into the platform's own post id. */
export function resolvePost(platform: unknown, url: unknown): { platform: SocialPlatform; postId: string } | null {
  const adapter = adapterFor(String(platform || ''));
  if (!adapter) return null;

  const parsed = parsePublicationUrl(url);
  if (parsed.ok && parsed.external_id) {
    return { platform: adapter.platform, postId: String(parsed.external_id) };
  }

  // publication.ts predates Threads and Reddit, so those two are resolved here
  // rather than by widening a parser the submission flow also depends on.
  const raw = String(url || '');
  if (adapter.platform === 'reddit') {
    const m = raw.match(/\/comments\/([a-z0-9]{4,10})/i) || raw.match(/redd\.it\/([a-z0-9]{4,10})/i);
    return m ? { platform: 'reddit', postId: `t3_${m[1]}` } : null;
  }
  if (adapter.platform === 'threads') {
    const m = raw.match(/threads\.(?:net|com)\/@[^/]+\/post\/([A-Za-z0-9_-]{5,32})/);
    return m ? { platform: 'threads', postId: m[1] } : null;
  }
  return null;
}

/**
 * Sync one post for one creator.
 *
 * `svc` is only used for reads the caller already scoped; every write here goes
 * through a service client because SocialPost and SocialConnection are both
 * server-owned.
 */
export async function syncPost(args: {
  creatorId: string;
  platform: unknown;
  postUrl: unknown;
  contestId?: string;
  submissionId?: string;
}): Promise<SyncResult> {
  const resolved = resolvePost(args.platform, args.postUrl);
  if (!resolved) {
    const adapter = adapterFor(String(args.platform || ''));
    return adapter
      ? { outcome: 'no_url', message: 'No recognisable post link was provided for this platform.' }
      : { outcome: 'unsupported_platform', message: 'RazeKit does not track this platform.' };
  }

  const adapter = adapterFor(resolved.platform)!;
  if (!adapter.configured()) {
    return {
      outcome: 'not_connected',
      platform: resolved.platform,
      message: `${adapter.platform} tracking is not available on RazeKit yet.`,
    };
  }

  const held = await credentialsFor(args.creatorId, resolved.platform);
  if (!held) {
    // The common case, and the one most often mis-rendered as zero: the creator
    // simply has not authorized this platform.
    return {
      outcome: 'not_connected',
      platform: resolved.platform,
      providerPostId: resolved.postId,
      message: `Connect ${adapter.platform} to track this post. Until then its performance is not measured.`,
    };
  }

  const svc = serviceClient();

  try {
    // Ownership before metrics, always. Fetching first and checking after would
    // mean a creator's dashboard briefly displayed someone else's numbers.
    const owned = await adapter.verifyOwnership(held.creds, resolved.postId);
    if (!owned.owned) {
      await svc.entities.SocialConnection.update(held.connectionId, {
        last_synced_at: new Date().toISOString(),
      }).catch(() => {});
      return {
        outcome: 'not_owned',
        platform: resolved.platform,
        providerPostId: resolved.postId,
        // Deliberately not an accusation. An unowned link is usually a mistake,
        // and the admin record carries the provider's actual reason.
        message: owned.checkable
          ? `This post is not on the connected ${adapter.platform} account. Check the link, or connect the account that published it.`
          : `RazeKit could not confirm this post belongs to the connected ${adapter.platform} account.`,
      };
    }

    const result = await adapter.fetchPostMetrics(held.creds, resolved.postId);

    // SocialPost is the provenance record: what the provider said, and when.
    // It is '*'-protected, so only this service-role write can create it.
    const numeric: Record<string, number> = {};
    for (const [name, value] of Object.entries(result.metrics)) {
      if (hasValue(value as MetricValue)) numeric[name] = (value as { value: number }).value;
    }

    await svc.entities.SocialPost.create({
      owner_user_id: args.creatorId,
      social_connection_id: held.connectionId,
      provider: resolved.platform,
      provider_post_id: result.providerPostId,
      post_url: String(args.postUrl || ''),
      published_at: result.providerTimestamp || null,
      last_synced_at: result.retrievedAt,
      ...numeric,
    }).catch(() => {});

    await svc.entities.SocialConnection.update(held.connectionId, {
      last_synced_at: result.retrievedAt,
      sync_error: null,
    }).catch(() => {});

    return {
      outcome: 'synced',
      platform: resolved.platform,
      providerPostId: result.providerPostId,
      metrics: result.metrics,
      retrievedAt: result.retrievedAt,
      message: `Updated from ${adapter.platform}.`,
    };
  } catch (e) {
    const kind = e instanceof AdapterError ? e.kind : 'provider_error';

    if (kind === 'unauthorized') {
      // The token died. Say so on the connection so the UI can ask for a
      // reconnect instead of showing a silently stale number forever.
      await svc.entities.SocialConnection.update(held.connectionId, {
        sync_error: 'authorization_expired',
      }).catch(() => {});
      return {
        outcome: 'needs_reconnect',
        platform: resolved.platform,
        providerPostId: resolved.postId,
        message: `Your ${adapter.platform} authorization has expired. Reconnect to resume tracking.`,
      };
    }

    return {
      outcome: 'unavailable',
      platform: resolved.platform,
      providerPostId: resolved.postId,
      message: kind === 'rate_limited'
        ? `${adapter.platform} is rate limiting requests. The next sync will retry.`
        : kind === 'not_found'
          ? 'The post could not be found. It may have been deleted or made private.'
          : `${adapter.platform} did not return data this time.`,
    };
  }
}
