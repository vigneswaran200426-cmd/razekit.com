// Google OAuth (Authorization Code flow). No SDK — plain fetch to Google's
// endpoints. Inert until GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI are set.
import { config } from '../config.js';

export function buildGoogleAuthUrl(returnTo: string): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state: returnTo,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error('Google OAuth is not configured');
  }
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
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${token.error || tokenRes.status}`);

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const info: any = await infoRes.json();
  if (!infoRes.ok || !info.email) throw new Error('Failed to fetch Google profile');
  return { sub: info.sub, email: String(info.email).toLowerCase(), name: info.name, picture: info.picture };
}
