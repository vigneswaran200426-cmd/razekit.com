// TikTok — Display API v2 with Login Kit (open.tiktokapis.com).
//
// Verified against developers.tiktok.com/docs/en/display-api-*. The important
// structural fact: /v2/video/query/ only ever returns the AUTHORIZED USER'S OWN
// videos. There is no endpoint to look up an arbitrary public video's stats. So
// on TikTok, ownership verification and metric fetch are the same call — if a
// video id comes back, it is theirs; if it does not, it is not.
//
// That is stricter than it sounds and it is a feature: a creator cannot submit
// someone else's viral video and have RazeKit score it.
import { config } from '../../config.js';
import { requestJson, form, num } from './http.js';
import {
  AdapterError, absent, metric, withDeclaredAbsences,
  type MetricCapability, type MetricName, type MetricValue,
  type PostMetrics, type SocialAdapter,
} from './types.js';

const HOST = 'https://open.tiktokapis.com';
const FIELDS = 'id,title,create_time,view_count,like_count,comment_count,share_count';

const CAPABILITIES: MetricCapability[] = [
  { metric: 'views', supported: true, apiField: 'view_count', notes: 'Own videos only, via video.list scope.' },
  { metric: 'likes', supported: true, apiField: 'like_count', notes: 'Own videos only.' },
  { metric: 'comments', supported: true, apiField: 'comment_count', notes: 'Own videos only.' },
  { metric: 'shares', supported: true, apiField: 'share_count', notes: 'Own videos only.' },
  { metric: 'saves', supported: false, apiField: '', notes: 'The Display API exposes no favourites/saves counter.' },
  { metric: 'watch_time', supported: false, apiField: '', notes: 'No watch-time or completion metric. TikTok shows it in Creator Center but ships no Display API equivalent; the Research API is a separate, approval-gated product.' },
  { metric: 'reach', supported: false, apiField: '', notes: 'No unique reach metric.' },
  { metric: 'impressions', supported: false, apiField: '', notes: 'Not exposed; view_count is the only play-like number.' },
  { metric: 'follower_growth', supported: false, apiField: '', notes: 'follower_count is account-level via user.info.profile and is not attributable to one video.' },
];

function readVideo(v: any): Partial<Record<MetricName, MetricValue>> {
  const pick = (x: unknown) => { const n = num(x); return n === undefined ? absent('unavailable') : metric(n); };
  return {
    views: pick(v?.view_count),
    likes: pick(v?.like_count),
    comments: pick(v?.comment_count),
    shares: pick(v?.share_count),
  };
}

/** One call serves both ownership and metrics; both entry points use it. */
async function queryOwnVideo(creds: { accessToken: string }, videoId: string): Promise<any | null> {
  const r = await requestJson<any>(`${HOST}/v2/video/query/?${new URLSearchParams({ fields: FIELDS })}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${creds.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ filters: { video_ids: [String(videoId)] } }),
  });
  const list = r?.data?.videos || [];
  return list.find((v: any) => String(v?.id) === String(videoId)) || null;
}

export const tiktokAdapter: SocialAdapter = {
  platform: 'tiktok',
  apiName: 'TikTok Display API v2 (Login Kit)',
  capabilities: CAPABILITIES,

  configured() {
    const c = config.social.tiktok;
    return Boolean(c.clientKey && c.clientSecret);
  },

  beginOAuth(redirectUri, state) {
    if (!this.configured()) throw new AdapterError('not_configured', 'TikTok credentials are not set');
    const p = new URLSearchParams({
      client_key: config.social.tiktok.clientKey,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'user.info.basic,video.list',
      state,
    });
    return { authorizeUrl: `https://www.tiktok.com/v2/auth/authorize/?${p}`, state };
  },

  async completeOAuth(code, redirectUri) {
    if (!this.configured()) throw new AdapterError('not_configured', 'TikTok credentials are not set');
    const r = await requestJson<any>(`${HOST}/v2/oauth/token/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({
        client_key: config.social.tiktok.clientKey,
        client_secret: config.social.tiktok.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: decodeURIComponent(String(code)),
      }),
    });
    return {
      accessToken: r?.access_token,
      refreshToken: r?.refresh_token,
      accountId: r?.open_id ? String(r.open_id) : undefined,
    };
  },

  async refresh(creds) {
    if (!creds.refreshToken) throw new AdapterError('unauthorized', 'No TikTok refresh token stored');
    const r = await requestJson<any>(`${HOST}/v2/oauth/token/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({
        client_key: config.social.tiktok.clientKey,
        client_secret: config.social.tiktok.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
      }),
    });
    return {
      accessToken: r?.access_token || creds.accessToken,
      refreshToken: r?.refresh_token || creds.refreshToken,
      accountId: creds.accountId,
    };
  },

  async resolveAccount(creds) {
    const r = await requestJson<any>(
      `${HOST}/v2/user/info/?${new URLSearchParams({ fields: 'open_id,union_id,display_name,avatar_url' })}`,
      { headers: { authorization: `Bearer ${creds.accessToken}` } },
    );
    const u = r?.data?.user;
    const accountId = String(u?.open_id || creds.accountId || '');
    if (!accountId) throw new AdapterError('provider_error', 'TikTok returned no open_id');
    return { accountId, displayName: u?.display_name };
  },

  async verifyOwnership(creds, providerPostId) {
    // video.query only returns the token holder's own videos, so presence IS
    // ownership and absence is a definitive negative rather than a maybe.
    const v = await queryOwnVideo(creds, providerPostId);
    return v
      ? { owned: true, checkable: true, reason: 'Video is returned by video.query under the creator\'s own token, which only ever lists their own videos.' }
      : { owned: false, checkable: true, reason: 'Video is not among the connected account\'s own videos.' };
  },

  async fetchPostMetrics(creds, providerPostId) {
    const v = await queryOwnVideo(creds, providerPostId);
    if (!v) throw new AdapterError('not_found', 'Video not found on the connected TikTok account');
    return {
      platform: 'tiktok',
      providerPostId,
      metrics: withDeclaredAbsences(tiktokAdapter, readVideo(v)),
      providerTimestamp: v?.create_time ? new Date(Number(v.create_time) * 1000).toISOString() : undefined,
      retrievedAt: new Date().toISOString(),
    } satisfies PostMetrics;
  },
};
