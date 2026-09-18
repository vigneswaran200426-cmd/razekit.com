// Instagram — "Instagram API with Instagram Login" (host graph.instagram.com).
//
// Verified against Meta's docs (developers.facebook.com/docs/instagram-platform),
// v26.0. Two facts shape this adapter:
//
//   1. `impressions` and `plays` were deprecated and replaced by `views`
//      (Jan 21 2025). Asking for the old names now errors, so this asks for
//      `views` and nothing else claims to be an impression count.
//   2. Personal Instagram accounts are out entirely — the API returns data only
//      for professional (Business/Creator) accounts. A creator on a personal
//      account is not a failure to report as zero; it is `unauthorized`.
//
// Access is gated on Meta App Review + Business Verification, not on payment.
// Until that is granted this adapter is configured() === false and the product
// says so.
import { config } from '../../config.js';
import { requestJson, form, num } from './http.js';
import {
  AdapterError, absent, metric, withDeclaredAbsences,
  type AdapterCredentials, type ConnectedAccount, type MetricCapability,
  type OwnershipResult, type PostMetrics, type SocialAdapter, type MetricValue, type MetricName,
} from './types.js';

const HOST = 'https://graph.instagram.com';
const VERSION = 'v26.0';

const CAPABILITIES: MetricCapability[] = [
  { metric: 'views', supported: true, apiField: 'views', notes: 'Replaced impressions/plays in Jan 2025. FEED, REELS and STORY. Organic only — excludes boosted surfaces. Meta still flags it "in development".' },
  { metric: 'likes', supported: true, apiField: 'likes', notes: 'FEED and REELS only, not STORY. Omitted entirely when the owner hides like counts — absent, not zero.' },
  { metric: 'comments', supported: true, apiField: 'comments', notes: 'FEED and REELS only. Excludes the caption; includes replies.' },
  { metric: 'shares', supported: true, apiField: 'shares', notes: 'FEED, REELS and STORY.' },
  { metric: 'saves', supported: true, apiField: 'saved', notes: 'API field is "saved", singular-past. FEED and REELS.' },
  { metric: 'reach', supported: true, apiField: 'reach', notes: 'Unique accounts that saw the media.' },
  { metric: 'watch_time', supported: false, apiField: '', notes: 'No per-post watch-time metric on the Instagram Login configuration. ig_reels_avg_watch_time exists only for REELS on the Facebook Login configuration, which requires a linked Page.' },
  { metric: 'impressions', supported: false, apiField: '', notes: 'Deprecated by Meta in Jan 2025 and removed. Use views.' },
  { metric: 'follower_growth', supported: false, apiField: '', notes: 'Account-level only (follower_count on the user insights edge), not attributable to one post.' },
];

/** Media insights come back as a list of {name, values:[{value}]}. */
function readInsights(payload: any): Partial<Record<MetricName, MetricValue>> {
  const out: Partial<Record<MetricName, MetricValue>> = {};
  const byName: Record<string, number | undefined> = {};
  for (const row of payload?.data || []) {
    byName[String(row?.name || '')] = num(row?.values?.[0]?.value);
  }
  const map: Array<[MetricName, string]> = [
    ['views', 'views'], ['likes', 'likes'], ['comments', 'comments'],
    ['shares', 'shares'], ['saves', 'saved'], ['reach', 'reach'],
  ];
  for (const [name, field] of map) {
    const v = byName[field];
    // Meta omits a metric it cannot compute for this media type rather than
    // sending 0 — so an omission stays an absence here too.
    out[name] = v === undefined ? absent('unavailable') : metric(v);
  }
  return out;
}

export const instagramAdapter: SocialAdapter = {
  platform: 'instagram',
  apiName: 'Instagram API with Instagram Login (Instagram Platform v26.0)',
  capabilities: CAPABILITIES,

  configured() {
    const c = config.social.instagram;
    return Boolean(c.clientId && c.clientSecret);
  },

  beginOAuth(redirectUri, state) {
    if (!this.configured()) throw new AdapterError('not_configured', 'Instagram credentials are not set');
    const p = new URLSearchParams({
      client_id: config.social.instagram.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_manage_insights',
      state,
    });
    return { authorizeUrl: `https://www.instagram.com/oauth/authorize?${p}`, state };
  },

  async completeOAuth(code, redirectUri) {
    if (!this.configured()) throw new AdapterError('not_configured', 'Instagram credentials are not set');
    // Meta appends a literal '#_' to the redirect; a code carrying it is rejected.
    const clean = String(code).replace(/#_$/, '');
    const short = await requestJson<any>('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({
        client_id: config.social.instagram.clientId,
        client_secret: config.social.instagram.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: clean,
      }),
    });

    // The short-lived token lasts an hour. Exchange immediately or the
    // connection is dead before the first scheduled sync ever runs.
    const long = await requestJson<any>(
      `${HOST}/access_token?${new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: config.social.instagram.clientSecret,
        access_token: short?.access_token || '',
      })}`,
    );

    return {
      accessToken: long?.access_token || short?.access_token,
      accountId: short?.user_id ? String(short.user_id) : undefined,
    };
  },

  async refresh(creds) {
    // Meta refuses a refresh on a token under 24h old or already expired; both
    // surface as a provider error, which the sync layer turns into "reconnect".
    const r = await requestJson<any>(
      `${HOST}/refresh_access_token?${new URLSearchParams({
        grant_type: 'ig_refresh_token',
        access_token: creds.accessToken,
      })}`,
    );
    return { ...creds, accessToken: r?.access_token || creds.accessToken };
  },

  async resolveAccount(creds) {
    const r = await requestJson<any>(
      `${HOST}/${VERSION}/me?${new URLSearchParams({
        fields: 'user_id,username,account_type,name',
        access_token: creds.accessToken,
      })}`,
    );
    // The Instagram Login configuration wraps /me in {data:[{...}]}.
    const me = Array.isArray(r?.data) ? r.data[0] : r;
    const accountId = String(me?.user_id || me?.id || '');
    if (!accountId) throw new AdapterError('provider_error', 'Instagram returned no account id');
    return {
      accountId,
      username: me?.username,
      displayName: me?.name,
      profileUrl: me?.username ? `https://www.instagram.com/${me.username}/` : undefined,
    };
  },

  async verifyOwnership(creds, providerPostId) {
    // Membership, not absence: the media must appear on the connected account's
    // own media edge. Asking the media node directly would only prove the token
    // can READ it, which is not the same as owning it.
    try {
      const r = await requestJson<any>(
        `${HOST}/${VERSION}/me/media?${new URLSearchParams({
          fields: 'id',
          limit: '100',
          access_token: creds.accessToken,
        })}`,
      );
      const ids = new Set((r?.data || []).map((m: any) => String(m?.id)));
      if (ids.has(String(providerPostId))) {
        return { owned: true, checkable: true, reason: 'Media appears on the connected account\'s own media edge.' };
      }
      // Not on the first page is not proof of anything — older posts paginate.
      const more = Boolean(r?.paging?.next);
      return {
        owned: false,
        checkable: !more,
        reason: more
          ? 'Not found on the first page of the account\'s media; older media was not paged.'
          : 'Media is not on the connected account\'s media edge.',
      };
    } catch (e) {
      if (e instanceof AdapterError && e.kind === 'not_found') {
        return { owned: false, checkable: true, reason: 'Media no longer exists or is not visible to this token.' };
      }
      throw e;
    }
  },

  async fetchPostMetrics(creds, providerPostId) {
    const r = await requestJson<any>(
      `${HOST}/${VERSION}/${encodeURIComponent(providerPostId)}/insights?${new URLSearchParams({
        metric: 'views,likes,comments,shares,saved,reach',
        access_token: creds.accessToken,
      })}`,
    );
    return {
      platform: 'instagram',
      providerPostId,
      metrics: withDeclaredAbsences(instagramAdapter, readInsights(r)),
      retrievedAt: new Date().toISOString(),
    } satisfies PostMetrics;
  },
};

export type { ConnectedAccount, AdapterCredentials, OwnershipResult };
