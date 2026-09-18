// Reddit — Reddit Data API (oauth.reddit.com).
//
// This is the adapter that most justifies the whole MetricValue design, because
// Reddit simply does not have most of what a campaign dashboard wants. Verified
// against reddit.com/dev/api/oauth, the archived JSON wiki, and Reddit's own
// open-sourced t3 template:
//
//   • SIX of the nine metrics do not exist: views, shares, saves, watch_time,
//     reach, impressions. Not "returned as zero" — absent from the platform.
//   • `view_count` appears in live responses but is undocumented, null for the
//     overwhelming majority of posts, and populated only for the author on
//     recent posts. It is marked unsupported here on purpose. If a campaign is
//     priced per view, Reddit cannot be the platform for it.
//   • `ups` is an ALIAS of `score`, and `downs` is hardcoded to 0 in Reddit's
//     own template. An adapter computing ups - downs is silently wrong on every
//     row. There is exactly one vote number: score.
//   • Vote totals are deliberately fuzzed to defeat spam bots. The net score is
//     right; false precision about it is not.
//
// Two hard operational rules, both enforced below: the token endpoint is on
// www.reddit.com while data is on oauth.reddit.com, and a descriptive
// User-Agent is mandatory or Reddit throttles regardless of a valid token.
import { config } from '../../config.js';
import { requestJson, form, basicAuth, num } from './http.js';
import {
  AdapterError, absent, metric, withDeclaredAbsences,
  type MetricCapability, type MetricName, type MetricValue,
  type PostMetrics, type SocialAdapter,
} from './types.js';

const OAUTH = 'https://oauth.reddit.com';
const WWW = 'https://www.reddit.com';

const CAPABILITIES: MetricCapability[] = [
  { metric: 'likes', supported: true, apiField: 'score', notes: 'Net score (upvotes minus downvotes), not a like count. Reddit fuzzes the up/down split by design; only the net is meaningful. Hidden while a subreddit\'s score-hide window is active.' },
  { metric: 'comments', supported: true, apiField: 'num_comments', notes: 'Includes removed and deleted comments, so it can exceed the visible count.' },
  { metric: 'views', supported: false, apiField: '', notes: 'view_count is undocumented, absent from Reddit\'s own t3 template and from the first-party Devvit Post class, and is null for the vast majority of posts. Not safe to price a payout on.' },
  { metric: 'shares', supported: false, apiField: '', notes: 'No share counter exists. num_crossposts counts crossposts, a different action, and is undocumented.' },
  { metric: 'saves', supported: false, apiField: '', notes: 'The t3 `saved` boolean is the viewer\'s own save state, not an aggregate. No save count is exposed.' },
  { metric: 'watch_time', supported: false, apiField: '', notes: 'No watch-time, retention or completion metric anywhere in the Data API, including for v.redd.it video.' },
  { metric: 'reach', supported: false, apiField: '', notes: 'No per-post audience sizing. Subreddit subscriber counts describe the community, not the post\'s audience.' },
  { metric: 'impressions', supported: false, apiField: '', notes: 'Organic impressions exist only in the separate Reddit Ads API, which cannot report on an organic submission.' },
  { metric: 'follower_growth', supported: false, apiField: '', notes: 'No follower count and no time series on the Data API.' },
];

const ua = () => config.social.reddit.userAgent;

export const redditAdapter: SocialAdapter = {
  platform: 'reddit',
  apiName: 'Reddit Data API (OAuth2)',
  capabilities: CAPABILITIES,

  configured() {
    const c = config.social.reddit;
    return Boolean(c.clientId && c.clientSecret && c.userAgent);
  },

  beginOAuth(redirectUri, state) {
    if (!this.configured()) throw new AdapterError('not_configured', 'Reddit credentials are not set');
    const p = new URLSearchParams({
      client_id: config.social.reddit.clientId,
      response_type: 'code',
      state,
      redirect_uri: redirectUri,
      // Without duration=permanent Reddit issues a one-hour token and NO
      // refresh token, and the only recovery is asking the creator to reconsent.
      duration: 'permanent',
      scope: 'identity read history',
    });
    return { authorizeUrl: `${WWW}/api/v1/authorize?${p}`, state };
  },

  async completeOAuth(code, redirectUri) {
    if (!this.configured()) throw new AdapterError('not_configured', 'Reddit credentials are not set');
    // Token exchange is on www.reddit.com, not oauth.reddit.com. Mixing the two
    // is the single most common Reddit integration bug.
    const r = await requestJson<any>(`${WWW}/api/v1/access_token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: basicAuth(config.social.reddit.clientId, config.social.reddit.clientSecret),
        'user-agent': ua(),
      },
      body: form({ grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri }),
    });
    return { accessToken: r?.access_token, refreshToken: r?.refresh_token };
  },

  async refresh(creds) {
    if (!creds.refreshToken) throw new AdapterError('unauthorized', 'No Reddit refresh token stored');
    const r = await requestJson<any>(`${WWW}/api/v1/access_token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: basicAuth(config.social.reddit.clientId, config.social.reddit.clientSecret),
        'user-agent': ua(),
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
    const me = await requestJson<any>(`${OAUTH}/api/v1/me`, {
      headers: { authorization: `bearer ${creds.accessToken}`, 'user-agent': ua() },
    });
    const name = String(me?.name || '');
    if (!name) throw new AdapterError('provider_error', 'Reddit returned no account name');
    return {
      // Key on the immutable t2_ id, not the display name.
      accountId: me?.id ? `t2_${me.id}` : name,
      username: name,
      displayName: name,
      profileUrl: `https://www.reddit.com/user/${name}/`,
    };
  },

  async verifyOwnership(creds, providerPostId) {
    const id36 = String(providerPostId).replace(/^t3_/, '');
    const me = await this.resolveAccount(creds);
    const info = await requestJson<any>(
      `${OAUTH}/api/info?${new URLSearchParams({ id: `t3_${id36}` })}`,
      { headers: { authorization: `bearer ${creds.accessToken}`, 'user-agent': ua() } },
    );
    const post = info?.data?.children?.[0]?.data;
    if (!post) return { owned: false, checkable: true, reason: 'Post not found; it may have been deleted or removed.' };

    const author = String(post.author || '');
    if (author === '[deleted]') {
      // A legitimately-theirs post that was later deleted reports [deleted].
      // Failing this closed would retroactively strip a creator's record, so it
      // is reported as uncheckable rather than as not-owned.
      return { owned: false, checkable: false, reason: 'Post author is [deleted]; ownership can no longer be established from the API.' };
    }
    const owned = author.toLowerCase() === String(me.username || '').toLowerCase();
    return {
      owned,
      checkable: true,
      reason: owned ? 'Post author matches the connected Reddit account.' : 'Post was submitted by a different Reddit account.',
    };
  },

  async fetchPostMetrics(creds, providerPostId) {
    const id36 = String(providerPostId).replace(/^t3_/, '');
    const info = await requestJson<any>(
      `${OAUTH}/api/info?${new URLSearchParams({ id: `t3_${id36}` })}`,
      { headers: { authorization: `bearer ${creds.accessToken}`, 'user-agent': ua() } },
    );
    const post = info?.data?.children?.[0]?.data;
    if (!post) throw new AdapterError('not_found', 'Reddit post not found');

    const out: Partial<Record<MetricName, MetricValue>> = {};

    // While a subreddit hides scores, the number returned is a placeholder
    // rather than the real one — reporting it would be reporting a guess.
    if (post.hide_score) {
      out.likes = absent('unavailable');
    } else {
      const score = num(post.score);
      out.likes = score === undefined ? absent('unavailable') : metric(score);
    }

    const comments = num(post.num_comments);
    out.comments = comments === undefined ? absent('unavailable') : metric(comments);

    return {
      platform: 'reddit',
      providerPostId: `t3_${id36}`,
      metrics: withDeclaredAbsences(redditAdapter, out),
      providerTimestamp: post?.created_utc ? new Date(Number(post.created_utc) * 1000).toISOString() : undefined,
      retrievedAt: new Date().toISOString(),
    } satisfies PostMetrics;
  },
};
