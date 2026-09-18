// Per-creator, per-platform authorization.
//
// The model: a creator authorizes each platform separately, and RazeKit tracks
// exactly the platforms they authorized — no more. Authorize Instagram only and
// you get Instagram tracking; TikTok stays "not connected", which is a
// different thing from "zero engagement" and is displayed as such.
//
// Nothing here ever fabricates a connection. A platform is only connected when
// the provider itself handed back a token and told us which account it belongs
// to, and the creator can withdraw that at any time.
//
// Two gates exist and they are not the same:
//   • the DEPLOYMENT gate — RazeKit must have a registered developer app with
//     the platform, or there is no OAuth client to authorize against. Reported
//     as `available: false`.
//   • the CREATOR gate — this creator must have authorized it. Reported as
//     `connected: false`.
// A creator seeing "not available" and one seeing "not connected" need
// different things to happen next, so the two are never collapsed.
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { serviceClient } from '../entities/service.js';
import { adapterFor, allAdapters, type SocialPlatform } from './adapters/index.js';
import { AdapterError } from './adapters/types.js';
import { saveCredentials, clearCredentials, loadCredentials, tokenStorageConfigured, safeEqual } from './tokens.js';

/** OAuth state lives in a signed, short-lived token rather than a table. */
const STATE_TTL_SECONDS = 600;
const STATE_PURPOSE = 'social_oauth';

export interface OAuthState {
  uid: string;
  platform: SocialPlatform;
  nonce: string;
}

export function signState(uid: string, platform: SocialPlatform): string {
  return jwt.sign(
    { uid, platform, nonce: randomUUID(), purpose: STATE_PURPOSE },
    config.jwtSecret,
    { expiresIn: STATE_TTL_SECONDS },
  );
}

/**
 * Verify a callback's state.
 *
 * Returns null on anything suspicious. The platform in the callback must match
 * the platform the state was minted for, otherwise a creator who started an
 * Instagram connection could be redirected into completing a TikTok one.
 */
export function readState(raw: string, platform: string): OAuthState | null {
  try {
    const d = jwt.verify(String(raw || ''), config.jwtSecret) as any;
    if (d?.purpose !== STATE_PURPOSE) return null;
    if (!d?.uid || !d?.platform) return null;
    if (!safeEqual(String(d.platform), String(platform))) return null;
    return { uid: String(d.uid), platform: d.platform, nonce: String(d.nonce || '') };
  } catch {
    return null;
  }
}

/**
 * Where the provider sends the creator back. Must match the URI registered in
 * the platform's app settings exactly, character for character.
 *
 * A dedicated GET route rather than /api/functions/*: the function router is
 * POST-only, and this is a browser redirect. The platform is a path segment
 * because several providers compare the registered redirect URI without its
 * query string.
 */
export const redirectUriFor = (platform: SocialPlatform): string =>
  `${config.apiBaseUrl.replace(/\/+$/, '')}/api/social/callback/${platform}`;

export interface ConnectionView {
  platform: SocialPlatform;
  apiName: string;
  /** RazeKit has a developer app for this platform. */
  available: boolean;
  /** This creator has authorized it. */
  connected: boolean;
  status: string;
  username?: string;
  profileUrl?: string;
  lastSyncedAt?: string | null;
  syncError?: string | null;
  /** Metrics this platform can ever produce, so the UI knows what to render. */
  supportedMetrics: string[];
  /** Why it is not usable, in words a creator can act on. */
  reason?: string;
}

/**
 * Everything the creator's "Connected platforms" screen needs, for every
 * platform — including the ones they have not connected, because "TikTok: not
 * connected" is the information that makes the screen actionable.
 */
export async function listConnections(svc: any, userId: string): Promise<ConnectionView[]> {
  const rows = await svc.entities.SocialConnection
    .filter({ owner_user_id: userId }, '-created_date', 50)
    .catch(() => []);

  return allAdapters().map((a) => {
    const row = rows.find((r: any) => String(r.provider) === a.platform && r.status !== 'disconnected');
    const available = a.configured() && tokenStorageConfigured();
    const connected = Boolean(row && row.status === 'connected');

    let reason: string | undefined;
    if (!a.configured()) {
      reason = `RazeKit does not have a ${a.platform} app configured yet, so this cannot be connected.`;
    } else if (!tokenStorageConfigured()) {
      // Refusing to connect is correct: a connection we cannot store securely
      // is worse than no connection.
      reason = 'Secure token storage is not configured on this deployment.';
    } else if (!connected) {
      reason = 'Not connected. Authorize this platform to track posts you submit from it.';
    } else if (row?.sync_error) {
      reason = 'The last sync failed. Reconnect to restore tracking.';
    }

    return {
      platform: a.platform,
      apiName: a.apiName,
      available,
      connected,
      status: connected ? (row.sync_error ? 'needs_reconnect' : 'connected') : available ? 'not_connected' : 'unavailable',
      username: row?.username || undefined,
      profileUrl: row?.profile_url || undefined,
      lastSyncedAt: row?.last_synced_at || null,
      syncError: row?.sync_error || null,
      supportedMetrics: a.capabilities.filter((c) => c.supported).map((c) => c.metric),
      reason,
    };
  });
}

export interface StartResult {
  ok: boolean;
  authorizeUrl?: string;
  reason?: string;
}

/** Begin authorization for one platform. */
export function startConnection(userId: string, platform: string): StartResult {
  const adapter = adapterFor(platform);
  if (!adapter) return { ok: false, reason: 'Unknown platform.' };
  if (!adapter.configured()) {
    return { ok: false, reason: `RazeKit does not have a ${adapter.platform} app configured yet.` };
  }
  if (!tokenStorageConfigured()) {
    return { ok: false, reason: 'Secure token storage is not configured, so connections are disabled.' };
  }
  const state = signState(userId, adapter.platform);
  const { authorizeUrl } = adapter.beginOAuth(redirectUriFor(adapter.platform), state);
  return { ok: true, authorizeUrl };
}

export interface CompleteResult {
  ok: boolean;
  platform?: SocialPlatform;
  username?: string;
  reason?: string;
}

/**
 * Finish authorization: exchange the code, find out whose account it is, and
 * record the connection.
 *
 * The SocialConnection row is written through a service client because its
 * identity fields (verified, status, provider_account_id, owner_user_id) are in
 * PROTECTED_FIELDS — a browser must never be able to assert "I own this
 * Instagram account".
 */
export async function completeConnection(args: {
  platform: string;
  code: string;
  state: string;
}): Promise<CompleteResult> {
  const adapter = adapterFor(args.platform);
  if (!adapter) return { ok: false, reason: 'Unknown platform.' };

  const state = readState(args.state, adapter.platform);
  if (!state) return { ok: false, reason: 'This authorization link has expired or does not match. Start again.' };
  if (!args.code) return { ok: false, reason: 'The platform did not return an authorization code.' };

  const svc = serviceClient();
  const now = new Date().toISOString();

  try {
    const creds = await adapter.completeOAuth(args.code, redirectUriFor(adapter.platform));
    const account = await adapter.resolveAccount(creds);

    // One connection per creator per platform. Reconnecting updates in place so
    // the history and the stored post rows stay attached to the same row.
    const [existing] = await svc.entities.SocialConnection
      .filter({ owner_user_id: state.uid, provider: adapter.platform }, '-created_date', 1)
      .catch(() => []);

    const row = {
      owner_user_id: state.uid,
      owner_type: 'creator',
      provider: adapter.platform,
      provider_account_id: account.accountId,
      username: account.username || '',
      display_name: account.displayName || '',
      profile_url: account.profileUrl || '',
      status: 'connected',
      // The provider itself just told us this account belongs to the person who
      // completed the consent screen. That is what verified means here.
      verified: true,
      scopes: [],
      last_synced_at: null,
      sync_error: null,
    };

    const connection = existing
      ? await svc.entities.SocialConnection.update(existing.id, row)
      : await svc.entities.SocialConnection.create(row);

    await saveCredentials(svc, {
      ownerUserId: state.uid,
      connectionId: connection.id,
      platform: adapter.platform,
      creds: { ...creds, accountId: account.accountId },
      now,
    });

    return { ok: true, platform: adapter.platform, username: account.username };
  } catch (e) {
    const msg = e instanceof AdapterError
      ? (e.kind === 'unauthorized'
        ? 'The platform refused the authorization. Please try connecting again.'
        : e.kind === 'rate_limited'
          ? 'The platform is rate limiting us right now. Try again shortly.'
          : 'The platform could not complete the connection.')
      : 'The platform could not complete the connection.';
    return { ok: false, reason: msg };
  }
}

/** Withdraw authorization. The creator's own decision, honoured immediately. */
export async function disconnect(svc: any, userId: string, platform: string): Promise<boolean> {
  const adapter = adapterFor(platform);
  if (!adapter) return false;
  const service = serviceClient();

  const rows = await service.entities.SocialConnection
    .filter({ owner_user_id: userId, provider: adapter.platform }, '-created_date', 5)
    .catch(() => []);

  for (const r of rows) {
    await clearCredentials(service, r.id);
    await service.entities.SocialConnection.update(r.id, {
      status: 'disconnected',
      sync_error: null,
      last_synced_at: null,
    }).catch(() => {});
  }
  return rows.length > 0;
}

/**
 * The credentials for one creator on one platform, or null.
 *
 * Null is the honest answer for "they never authorized this platform" and for
 * "the token is gone" alike — both mean RazeKit cannot read their metrics, and
 * neither means the post performed badly.
 */
export async function credentialsFor(
  userId: string,
  platform: SocialPlatform,
): Promise<{ connectionId: string; creds: NonNullable<Awaited<ReturnType<typeof loadCredentials>>> } | null> {
  const svc = serviceClient();
  const [row] = await svc.entities.SocialConnection
    .filter({ owner_user_id: userId, provider: platform, status: 'connected' }, '-created_date', 1)
    .catch(() => []);
  if (!row) return null;
  const creds = await loadCredentials(svc, row.id);
  return creds ? { connectionId: row.id, creds } : null;
}
