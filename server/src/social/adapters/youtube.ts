// YouTube — Data API v3 (public stats) + Analytics API v2 (owner-only).
//
// Verified against developers.google.com/youtube. These are two separate Google
// Cloud APIs that must both be enabled, and critically THEIR NUMBERS DO NOT
// RECONCILE: Data API `viewCount` is a lifetime public counter, while Analytics
// `views` is a windowed, processed figure that lags and excludes some traffic.
//
// This adapter therefore takes each metric from exactly one source and says
// which, rather than blending them into a number that matches neither. Views
// come from the Data API because that is what the public sees on the video;
// watch time and subscriber change come from Analytics because they exist
// nowhere else.
import { config } from '../../config.js';
import { requestJson, form, num } from './http.js';
import {
  AdapterError, absent, metric, withDeclaredAbsences,
  type MetricCapability, type MetricName, type MetricValue,
  type PostMetrics, type SocialAdapter,
} from './types.js';

const DATA = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2';

const CAPABILITIES: MetricCapability[] = [
  { metric: 'views', supported: true, apiField: 'statistics.viewCount (Data API v3)', notes: 'Lifetime public counter, the number shown under the video.' },
  { metric: 'likes', supported: true, apiField: 'statistics.likeCount (Data API v3)', notes: 'Omitted when the channel hides like counts — absent, not zero.' },
  { metric: 'comments', supported: true, apiField: 'statistics.commentCount (Data API v3)', notes: 'Omitted entirely when comments are disabled.' },
  { metric: 'watch_time', supported: true, apiField: 'estimatedMinutesWatched (Analytics API v2)', notes: 'Owner-only, requires yt-analytics.readonly. Stored as minutes. Lags roughly 1-2 days and will not reconcile with Data API views.' },
  { metric: 'follower_growth', supported: true, apiField: 'subscribersGained (Analytics API v2)', notes: 'Owner-only, attributed to the video over the queried window. Net of subscribersLost is not applied.' },
  { metric: 'shares', supported: false, apiField: '', notes: 'Analytics has a `shares` metric but only channel-wide over a window, not reliably per-video for arbitrary ranges; not exposed here rather than reported imprecisely.' },
  { metric: 'saves', supported: false, apiField: '', notes: 'No saves/add-to-playlist counter is exposed per video.' },
  { metric: 'reach', supported: false, apiField: '', notes: 'No unique reach metric.' },
  { metric: 'impressions', supported: false, apiField: '', notes: 'Impressions exist only in YouTube Studio, not in either public API.' },
];

export const youtubeAdapter: SocialAdapter = {
  platform: 'youtube',
  apiName: 'YouTube Data API v3 + YouTube Analytics API v2',
  capabilities: CAPABILITIES,

  configured() {
    const c = config.social.youtube;
    return Boolean(c.clientId && c.clientSecret);
  },

  beginOAuth(redirectUri, state) {
    if (!this.configured()) throw new AdapterError('not_configured', 'YouTube credentials are not set');
    const p = new URLSearchParams({
      client_id: config.social.youtube.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly',
      // Google issues a refresh token only on the first consent unless forced.
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return { authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${p}`, state };
  },

  async completeOAuth(code, redirectUri) {
    if (!this.configured()) throw new AdapterError('not_configured', 'YouTube credentials are not set');
    const r = await requestJson<any>('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({
        client_id: config.social.youtube.clientId,
        client_secret: config.social.youtube.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: String(code),
      }),
    });
    return { accessToken: r?.access_token, refreshToken: r?.refresh_token };
  },

  async refresh(creds) {
    if (!creds.refreshToken) throw new AdapterError('unauthorized', 'No YouTube refresh token stored');
    const r = await requestJson<any>('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({
        client_id: config.social.youtube.clientId,
        client_secret: config.social.youtube.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
      }),
    });
    // Google does not reissue the refresh token on every refresh.
    return { ...creds, accessToken: r?.access_token || creds.accessToken };
  },

  async resolveAccount(creds) {
    const r = await requestJson<any>(
      `${DATA}/channels?${new URLSearchParams({ part: 'id,snippet', mine: 'true' })}`,
      { headers: { authorization: `Bearer ${creds.accessToken}` } },
    );
    const ch = r?.items?.[0];
    const accountId = String(ch?.id || '');
    if (!accountId) throw new AdapterError('provider_error', 'No YouTube channel on this Google account');
    return {
      accountId,
      username: ch?.snippet?.customUrl,
      displayName: ch?.snippet?.title,
      profileUrl: `https://www.youtube.com/channel/${accountId}`,
    };
  },

  async verifyOwnership(creds, providerPostId) {
    // The video's channelId must equal the connected channel. Read with the
    // user's own token so a private/unlisted video of theirs still resolves.
    const [me, vid] = await Promise.all([
      this.resolveAccount(creds),
      requestJson<any>(
        `${DATA}/videos?${new URLSearchParams({ part: 'snippet', id: String(providerPostId) })}`,
        { headers: { authorization: `Bearer ${creds.accessToken}` } },
      ),
    ]);
    const item = vid?.items?.[0];
    if (!item) return { owned: false, checkable: true, reason: 'Video does not exist or is not visible to this account.' };
    const owned = String(item?.snippet?.channelId || '') === me.accountId;
    return {
      owned,
      checkable: true,
      reason: owned
        ? 'Video channelId matches the connected channel.'
        : 'Video belongs to a different channel than the one connected.',
    };
  },

  async fetchPostMetrics(creds, providerPostId) {
    const auth = { authorization: `Bearer ${creds.accessToken}` };
    const out: Partial<Record<MetricName, MetricValue>> = {};

    const stats = await requestJson<any>(
      `${DATA}/videos?${new URLSearchParams({ part: 'statistics,snippet', id: String(providerPostId) })}`,
      { headers: auth },
    );
    const item = stats?.items?.[0];
    if (!item) throw new AdapterError('not_found', 'YouTube video not found');
    const s = item.statistics || {};
    // A hidden like count or disabled comments means the field is absent from
    // the response entirely. That is not zero and must not become zero.
    const pick = (x: unknown) => { const n = num(x); return n === undefined ? absent('unavailable') : metric(n); };
    out.views = pick(s.viewCount);
    out.likes = pick(s.likeCount);
    out.comments = pick(s.commentCount);

    // Owner-only analytics are best-effort: the creator may have granted only
    // youtube.readonly. A refusal marks those two unauthorized rather than
    // failing the whole sync and losing the public numbers we did get.
    try {
      const published = item?.snippet?.publishedAt;
      const start = published ? String(published).slice(0, 10) : '2005-02-14';
      const end = new Date().toISOString().slice(0, 10);
      const a = await requestJson<any>(
        `${ANALYTICS}/reports?${new URLSearchParams({
          ids: 'channel==MINE',
          startDate: start,
          endDate: end,
          metrics: 'estimatedMinutesWatched,subscribersGained',
          filters: `video==${providerPostId}`,
        })}`,
        { headers: auth },
      );
      const row = a?.rows?.[0];
      out.watch_time = row && num(row[0]) !== undefined ? metric(num(row[0])!) : absent('unavailable');
      out.follower_growth = row && num(row[1]) !== undefined ? metric(num(row[1])!) : absent('unavailable');
    } catch (e) {
      const kind = e instanceof AdapterError ? e.kind : 'provider_error';
      const reason = kind === 'unauthorized' ? 'unauthorized' as const : 'unavailable' as const;
      out.watch_time = absent(reason);
      out.follower_growth = absent(reason);
    }

    return {
      platform: 'youtube',
      providerPostId,
      metrics: withDeclaredAbsences(youtubeAdapter, out),
      providerTimestamp: item?.snippet?.publishedAt,
      retrievedAt: new Date().toISOString(),
    } satisfies PostMetrics;
  },
};
