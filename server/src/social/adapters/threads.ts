// Threads — the official Threads API (graph.threads.net, v1.0).
//
// Verified against developers.facebook.com/docs/threads. Threads has a real
// post-insights edge, which makes it better instrumented than most of the
// others here, but its vocabulary differs from Instagram's: replies rather than
// comments, reposts and quotes as separate counters, and no saves or reach at
// the post level at all.
//
// Mapping note: RazeKit stores `comments`, so Threads `replies` is recorded
// there. `reposts` and `quotes` are both shares in RazeKit's vocabulary, so
// they are summed into `shares` — and that summation is stated in the
// capability notes rather than being silently baked in, because a brand
// comparing Threads shares against TikTok shares deserves to know they are not
// the same measurement.
import { config } from '../../config.js';
import { requestJson, form, num } from './http.js';
import {
  AdapterError, absent, metric, withDeclaredAbsences,
  type MetricCapability, type MetricName, type MetricValue,
  type PostMetrics, type SocialAdapter,
} from './types.js';

const HOST = 'https://graph.threads.net';

const CAPABILITIES: MetricCapability[] = [
  { metric: 'views', supported: true, apiField: 'views', notes: 'Post-level. Threads calls this views; it is the closest analogue to an impression count.' },
  { metric: 'likes', supported: true, apiField: 'likes', notes: 'Post-level.' },
  { metric: 'comments', supported: true, apiField: 'replies', notes: 'Threads calls these replies. Stored as comments because that is RazeKit\'s field; the label shown to users says replies.' },
  { metric: 'shares', supported: true, apiField: 'reposts + quotes', notes: 'Threads counts reposts and quotes separately and has no single "shares" number. RazeKit sums them. Not directly comparable to a TikTok or Instagram share count.' },
  { metric: 'saves', supported: false, apiField: '', notes: 'Threads exposes no save counter.' },
  { metric: 'reach', supported: false, apiField: '', notes: 'No post-level unique reach. Only account-level insights carry audience figures.' },
  { metric: 'watch_time', supported: false, apiField: '', notes: 'No watch-time or retention metric on the Threads API.' },
  { metric: 'impressions', supported: false, apiField: '', notes: 'Not exposed as a distinct metric; views is the available signal.' },
  { metric: 'follower_growth', supported: false, apiField: '', notes: 'Account-level only (followers_count), not attributable to a single post.' },
];

function readInsights(payload: any): Partial<Record<MetricName, MetricValue>> {
  const by: Record<string, number | undefined> = {};
  for (const row of payload?.data || []) by[String(row?.name || '')] = num(row?.values?.[0]?.value);

  const out: Partial<Record<MetricName, MetricValue>> = {};
  out.views = by.views === undefined ? absent('unavailable') : metric(by.views);
  out.likes = by.likes === undefined ? absent('unavailable') : metric(by.likes);
  out.comments = by.replies === undefined ? absent('unavailable') : metric(by.replies);

  // Only claim a share count when at least one of the two parts arrived.
  // Treating a missing repost count as 0 would understate it silently.
  const reposts = by.reposts;
  const quotes = by.quotes;
  out.shares = reposts === undefined && quotes === undefined
    ? absent('unavailable')
    : metric((reposts || 0) + (quotes || 0));

  return out;
}

export const threadsAdapter: SocialAdapter = {
  platform: 'threads',
  apiName: 'Threads API v1.0',
  capabilities: CAPABILITIES,

  configured() {
    const c = config.social.threads;
    return Boolean(c.clientId && c.clientSecret);
  },

  beginOAuth(redirectUri, state) {
    if (!this.configured()) throw new AdapterError('not_configured', 'Threads credentials are not set');
    const p = new URLSearchParams({
      client_id: config.social.threads.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'threads_basic,threads_manage_insights',
      state,
    });
    return { authorizeUrl: `https://threads.net/oauth/authorize?${p}`, state };
  },

  async completeOAuth(code, redirectUri) {
    if (!this.configured()) throw new AdapterError('not_configured', 'Threads credentials are not set');
    const short = await requestJson<any>(`${HOST}/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({
        client_id: config.social.threads.clientId,
        client_secret: config.social.threads.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: String(code).replace(/#_$/, ''),
      }),
    });
    const long = await requestJson<any>(
      `${HOST}/access_token?${new URLSearchParams({
        grant_type: 'th_exchange_token',
        client_secret: config.social.threads.clientSecret,
        access_token: short?.access_token || '',
      })}`,
    );
    return {
      accessToken: long?.access_token || short?.access_token,
      accountId: short?.user_id ? String(short.user_id) : undefined,
    };
  },

  async refresh(creds) {
    const r = await requestJson<any>(
      `${HOST}/refresh_access_token?${new URLSearchParams({
        grant_type: 'th_refresh_token',
        access_token: creds.accessToken,
      })}`,
    );
    return { ...creds, accessToken: r?.access_token || creds.accessToken };
  },

  async resolveAccount(creds) {
    const me = await requestJson<any>(
      `${HOST}/v1.0/me?${new URLSearchParams({
        fields: 'id,username,name',
        access_token: creds.accessToken,
      })}`,
    );
    const accountId = String(me?.id || '');
    if (!accountId) throw new AdapterError('provider_error', 'Threads returned no account id');
    return {
      accountId,
      username: me?.username,
      displayName: me?.name,
      profileUrl: me?.username ? `https://www.threads.net/@${me.username}` : undefined,
    };
  },

  async verifyOwnership(creds, providerPostId) {
    // The insights edge is owner-only: Threads refuses it for a post the token
    // does not own. A successful read is therefore itself the ownership proof,
    // and a 401/403 is a definitive "not yours" rather than a transient error.
    try {
      await requestJson<any>(
        `${HOST}/v1.0/${encodeURIComponent(providerPostId)}/insights?${new URLSearchParams({
          metric: 'views',
          access_token: creds.accessToken,
        })}`,
      );
      return { owned: true, checkable: true, reason: 'Threads returned owner-only insights for this post under the creator\'s token.' };
    } catch (e) {
      if (e instanceof AdapterError && (e.kind === 'unauthorized' || e.kind === 'not_found')) {
        return { owned: false, checkable: true, reason: 'Threads refused owner-only insights for this post under the creator\'s token.' };
      }
      throw e;
    }
  },

  async fetchPostMetrics(creds, providerPostId) {
    const r = await requestJson<any>(
      `${HOST}/v1.0/${encodeURIComponent(providerPostId)}/insights?${new URLSearchParams({
        metric: 'views,likes,replies,reposts,quotes',
        access_token: creds.accessToken,
      })}`,
    );
    return {
      platform: 'threads',
      providerPostId,
      metrics: withDeclaredAbsences(threadsAdapter, readInsights(r)),
      retrievedAt: new Date().toISOString(),
    } satisfies PostMetrics;
  },
};
