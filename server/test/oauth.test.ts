import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleAuthUrl, verifyGoogleState } from '../src/auth/oauth.js';

test('Google OAuth state is signed and round-trips the approved return URL', () => {
  const authUrl = new URL(buildGoogleAuthUrl('http://localhost:5173/after-login?from=oauth'));
  const state = authUrl.searchParams.get('state');
  assert.ok(state);
  assert.equal(verifyGoogleState(state), 'http://localhost:5173/after-login?from=oauth');
});

test('Google OAuth state rejects tampering and stale state', () => {
  assert.equal(verifyGoogleState('not-a-valid-state'), null);
  const authUrl = new URL(buildGoogleAuthUrl('http://localhost:5173/'));
  const state = authUrl.searchParams.get('state');
  assert.ok(state);
  const parts = state.split('.');
  parts[1] = Buffer.from('http://evil.example/').toString('base64url');
  assert.equal(verifyGoogleState(parts.join('.')), null);
});
