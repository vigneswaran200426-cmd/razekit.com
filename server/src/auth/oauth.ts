// Google OAuth (Authorization Code flow). State is authenticated to prevent CSRF / state tampering.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret() {
  return config.google.clientSecret || config.sessionSecret;
}

function signState(returnTo: string, issuedAt: number) {
  const payload = `${issuedAt}.${returnTo}`;
  return `${issuedAt}.${Buffer.from(returnTo, 'utf8').toString('base64url')}.${createHmac('sha256', stateSecret()).update(payload).digest('base64url')}`;
}

export function buildGoogleAuthUrl(returnTo: string): string {
  const safeReturnTo = normalizeReturnTo(returnTo);
  const issuedAt = Date.now();
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state: signState(safeReturnTo, issuedAt),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function verifyGoogleState(state: string): string | null {
  try {
    const [issued, encodedReturnTo, signature] = String(state || '').split('.');
    const issuedAt = Number(issued);
    const returnTo = Buffer.from(encodedReturnTo, 'base64url').toString('utf8');
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > STATE_TTL_MS || !returnTo || !signature) return null;
    const expected = createHmac('sha256', stateSecret()).update(`${issuedAt}.${returnTo}`).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return normalizeReturnTo(returnTo);
  } catch {
    return null;
  }
}

function normalizeReturnTo(returnTo: string): string {
  try {
    const value = new URL(returnTo || config.webBaseUrl, config.webBaseUrl);
    if (value.origin === new URL(config.webBaseUrl).origin) return value.toString();
  } catch {}
  return config.webBaseUrl;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  if (!config.google.clientId || !config.google.clientSecret) throw new Error('Google OAuth is not configured');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const token: any = await tokenRes.json();
  if (!tokenRes.ok || !token.access_token) throw new Error(`Google token exchange failed: ${token.error || tokenRes.status}`);

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const info: any = await infoRes.json();
  if (!infoRes.ok || !info.email || !info.sub) throw new Error('Failed to fetch Google profile');
  return { sub: info.sub, email: String(info.email).toLowerCase(), name: info.name, picture: info.picture };
}