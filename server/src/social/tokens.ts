// Encrypted storage for social OAuth tokens.
//
// This exists as its own module for one reason: SocialConnection's RLS read
// rule is `true` (entities/schemas.json) — every authenticated user can read
// every row. That is fine for a public "Instagram — connected" badge and fatal
// for an access token, so tokens are not stored on that entity and never will
// be. They live in SocialToken, whose RLS is admin-only and whose every field
// is in PROTECTED_FIELDS, and they are encrypted at rest on top of that.
//
// Defence in depth, deliberately: RLS is the gate, PROTECTED_FIELDS stops a
// forged write, and AES-256-GCM means a database dump alone does not hand over
// the creator's account.
import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import type { AdapterCredentials, SocialPlatform } from './adapters/types.js';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;   // GCM standard nonce length
const TAG_BYTES = 16;

/**
 * The key is derived from SOCIAL_TOKEN_KEY, not used raw, so any length of
 * secret works and the stored ciphertext does not reveal the key's shape.
 */
function key(): Buffer | null {
  // Environment first, boot snapshot second — the same resolution order
  // paymentMode() uses. `config` captures env at import time, so a snapshot
  // alone would make this module untestable and would silently ignore a key
  // set after module load. On Render the environment is fixed before boot, so
  // production behaviour is identical either way.
  const raw = process.env.SOCIAL_TOKEN_KEY || config.social?.tokenKey || '';
  if (!raw) return null;
  return createHash('sha256').update(raw).digest();
}

/** True when this deployment can store tokens at all. */
export const tokenStorageConfigured = (): boolean => key() !== null;

/**
 * Encrypt to `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 *
 * Versioned so a future key rotation can decrypt old values while writing new
 * ones, rather than silently failing on everything already stored.
 */
export function sealToken(plain: string): string {
  const k = key();
  if (!k) throw new Error('SOCIAL_TOKEN_KEY is not set — refusing to store a token in plaintext');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, k, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function openToken(sealed: string): string | null {
  const k = key();
  if (!k || typeof sealed !== 'string') return null;
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ct = Buffer.from(parts[3], 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
    const decipher = createDecipheriv(ALGO, k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    // A wrong key or a tampered value lands here. Returning null makes the
    // caller treat the connection as needing reconnection, which is the honest
    // outcome — there is no safe way to "partially" recover a token.
    return null;
  }
}

/** Row shape stored in the SocialToken entity. Values are sealed, never raw. */
export interface StoredToken {
  owner_user_id: string;
  social_connection_id: string;
  provider: SocialPlatform;
  access_token: string;   // sealed
  refresh_token: string;  // sealed, '' when the provider issues none
  provider_account_id: string;
  expires_at: string | null;
  scopes: string[];
  updated_at: string;
}

/**
 * Persist credentials for a connection.
 *
 * `svc` must be a service-role client: SocialToken is admin-only at the RLS
 * layer and '*'-protected, so a user-scoped client cannot write it — which is
 * the point.
 */
export async function saveCredentials(
  svc: any,
  args: {
    ownerUserId: string;
    connectionId: string;
    platform: SocialPlatform;
    creds: AdapterCredentials;
    expiresAt?: string | null;
    scopes?: string[];
    now: string;
  },
): Promise<void> {
  const row: StoredToken = {
    owner_user_id: args.ownerUserId,
    social_connection_id: args.connectionId,
    provider: args.platform,
    access_token: sealToken(args.creds.accessToken),
    refresh_token: args.creds.refreshToken ? sealToken(args.creds.refreshToken) : '',
    provider_account_id: args.creds.accountId || '',
    expires_at: args.expiresAt || null,
    scopes: args.scopes || [],
    updated_at: args.now,
  };

  const [existing] = await svc.entities.SocialToken
    .filter({ social_connection_id: args.connectionId }, '-created_date', 1)
    .catch(() => []);

  if (existing) await svc.entities.SocialToken.update(existing.id, row);
  else await svc.entities.SocialToken.create(row);
}

/** Load and decrypt. Returns null when absent or undecryptable. */
export async function loadCredentials(
  svc: any,
  connectionId: string,
): Promise<AdapterCredentials | null> {
  const [row] = await svc.entities.SocialToken
    .filter({ social_connection_id: connectionId }, '-created_date', 1)
    .catch(() => []);
  if (!row) return null;

  const accessToken = openToken(row.access_token);
  if (!accessToken) return null;
  const refreshToken = row.refresh_token ? openToken(row.refresh_token) : null;

  return {
    accessToken,
    refreshToken: refreshToken || undefined,
    accountId: row.provider_account_id || undefined,
  };
}

/** Remove stored tokens. Called on disconnect and on a hard auth failure. */
export async function clearCredentials(svc: any, connectionId: string): Promise<void> {
  const rows = await svc.entities.SocialToken
    .filter({ social_connection_id: connectionId }, '-created_date', 10)
    .catch(() => []);
  for (const r of rows) await svc.entities.SocialToken.delete(r.id).catch(() => {});
}

/**
 * Constant-time compare for OAuth `state`.
 *
 * `===` on a secret leaks its prefix through timing. The lengths are compared
 * first because timingSafeEqual throws on a mismatch, and that throw would
 * itself be the leak.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}
