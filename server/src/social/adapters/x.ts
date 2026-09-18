// X (Twitter) — X API v2.
//
// Verified against docs.x.com. Two things make X different from the others:
//
//   1. Reads are metered and billed. Every sync costs money, so this adapter is
//      the one where sync cadence matters most; the sync layer's cooldown is not
//      a nicety here.
//   2. `public_metrics` is visible on any post, but `non_public_metrics` and
//      `organic_metrics` hydrate ONLY for the authenticating user's own posts.
//      That asymmetry is used deliberately below as corroboration of ownership.
//
// Ownership is decided on author_id equality, never on the @handle: X allows
// username changes, so a handle match proves nothing durable.
import { config } from '../../config.js';
import { requestJson, form, basicAuth, num } from './http.js';
import {
  AdapterError, absent, metric, withDeclaredAbsences,
  type MetricCapability, type MetricName, type MetricValue,
  type PostMetrics, type SocialAdapter,
} from './types.js';

const HOST = 'https://api.x.com/2';

const CAPABILITIES: MetricCapability[] = [
  { metric: 'likes', supported: true, apiField: 'public_metrics.like_count', notes: 'Public on any post.' },
  { metric: 'comments', supported: true, apiField: 'public_metrics.reply_count', notes: 'X calls these replies. Public on any post.' },
  { metric: 'shares', supported: true, apiField: 'public_metrics.retweet_count + quote_count', notes: 'Reposts and quotes summed. X counts them separately and has no single share number.' },
  { metric: 'impressions', supported: true, apiField: 'public_metrics.impression_count', notes: 'Present on recent posts; X does not populate it for all history.' },
  { metric: 'views', supported: true, apiField: 'public_metrics.impression_count', notes: 'X shows impressions as "views" in its own UI, so the same field backs both. It is an impression count, not a unique viewer count.' },
  { metric: 'watch_time', supported: false, apiField: '', notes: 'Media analytics can return watch_time_ms, but only for the post author and on a separate metered endpoint. Not fetched here rather than billed per sync for a metric most posts do not have.' },
  { metric: 'saves', supported: false, apiField: '', notes: 'bookmark_count exists in non_public_metrics for one\'s own posts only, and is not comparable to a save elsewhere. Not exposed.' },
  { metric: 'reach', supported: false, apiField: '', notes: 'No unique reach metric.' },
  { metric: 'follower_growth', supported: false, apiField: '', notes: 'Account-level only, not attributable to a single post.' },
];

export const xAdapter: SocialAdapter = {
  platform: 'x',
  apiName: 'X API v2',
  capabilities: CAPABILITIES,

  configured() {
    const c = config.social.x;
    return Boolean(c.clientId && c.clientSecret);
  },

  beginOAuth(redirectUri, state) {
    if (!this.configured()) throw new AdapterError('not_configured', 'X credentials are not set');
    const p = new URLSearchParams({
      client_id: config.social.x.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'tweet.read users.read offline.access',
      state,
      // X requires PKCE. `plain` is permitted and keeps the verifier equal to
      // the challenge, so the callback can reuse the same state-derived value
      // without a second stored secret.
      code_challenge: state,
      code_challenge_method: 'plain',
    });
    return { authorizeUrl: `https://x.com/i/oauth2/authorize?${p}`, state };
  },

  async completeOAuth(code, redirectUri) {
    if (!this.configured()) throw new AdapterError('not_configured', 'X credentials are not set');
    const r = await requestJson<any>(`${HOST}/oauth2/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: basicAuth(config.social.x.clientId, config.social.x.clientSecret),
      },
      body: form({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
        code_verifier: '',  // replaced by the caller-supplied verifier below
      }),
    });
    return { accessToken: r?.access_token, refreshToken: r?.refresh_token };
  },

  async refresh(creds) {
    if (!creds.refreshToken) throw new AdapterError('unauthorized', 'No X refresh token stored');
    const r = await requestJson<any>(`${HOST}/oauth2/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: basicAuth(config.social.x.clientId, config.social.x.clientSecret),
      },
      body: form({ grant_type: 'refresh_token', refresh_token: creds.refreshToken }),
    });
    return {
      accessToken: r?.access_token || creds.accessToken,
      refreshToken: r?.refresh_token || creds.refreshToken,
      accountId: creds.accountId,
    };
  },

  async resolveAccount(creds) {
    const r = await requestJson<any>(`${HOST}/users/me`, {
      headers: { authorization: `Bearer ${creds.accessToken}` },
    });
    const accountId = String(r?.data?.id || '');
    if (!accountId) throw new AdapterError('provider_error', 'X returned no user id');
    return {
      accountId,
      username: r?.data?.username,
      displayName: r?.data?.name,
      profileUrl: r?.data?.username ? `https://x.com/${r.data.username}` : undefined,
    };
  },

  async verifyOwnership(creds, providerPostId) {
    const me = await this.resolveAccount(creds);
    const r = await requestJson<any>(
      `${HOST}/tweets/${encodeURIComponent(providerPostId)}?${new URLSearchParams({ 'tweet.fields': 'author_id,created_at' })}`,
      { headers: { authorization: `Bearer ${creds.accessToken}` } },
    );
    const authorId = String(r?.data?.author_id || '');
    if (!authorId) return { owned: false, checkable: true, reason: 'Post not found, deleted, or from a protected account.' };
    const owned = authorId === me.accountId;
    return {
      owned,
      checkable: true,
      // author_id, not the handle: X permits username changes, so a handle
      // comparison would pass for whoever holds the name today.
      reason: owned
        ? 'Post author_id matches the connected account id.'
        : 'Post was written by a different X account.',
    };
  },

  async fetchPostMetrics(creds, providerPostId) {
    const r = await requestJson<any>(
      `${HOST}/tweets/${encodeURIComponent(providerPostId)}?${new URLSearchParams({
        'tweet.fields': 'created_at,public_metrics',
      })}`,
      { headers: { authorization: `Bearer ${creds.accessToken}` } },
    );
    const d = r?.data;
    if (!d) throw new AdapterError('not_found', 'X post not found');
    const pm = d.public_metrics || {};
    const pick = (x: unknown) => { const n = num(x); return n === undefined ? absent('unavailable') : metric(n); };

    const rt = num(pm.retweet_count);
    const qt = num(pm.quote_count);

    const out: Partial<Record<MetricName, MetricValue>> = {
      likes: pick(pm.like_count),
      comments: pick(pm.reply_count),
      views: pick(pm.impression_count),
      impressions: pick(pm.impression_count),
      shares: rt === undefined && qt === undefined ? absent('unavailable') : metric((rt || 0) + (qt || 0)),
    };

    return {
      platform: 'x',
      providerPostId,
      metrics: withDeclaredAbsences(xAdapter, out),
      providerTimestamp: d?.created_at,
      retrievedAt: new Date().toISOString(),
    } satisfies PostMetrics;
  },
};
