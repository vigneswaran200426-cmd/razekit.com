// @ts-nocheck
// The OAuth callback the social platforms redirect a creator back to.
//
// A real route rather than a function handler, for two reasons: the function
// router is POST-only and this is a browser GET, and the creator should land
// back inside RazeKit rather than looking at a JSON body.
//
// No session is required here, and that is deliberate rather than an oversight.
// A creator returning from a cross-site redirect may not carry their cookie,
// so identity comes from the signed `state` instead — bound to their user id
// and to the platform, and expiring in ten minutes. Being reachable without a
// session therefore grants nothing: without a valid state there is no user to
// attach a connection to.
import { Router } from 'express';
import { config } from '../config.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { completeConnection } from './connect.js';
import { SOCIAL_PLATFORMS } from './adapters/types.js';

export const socialRouter = Router();

// The callback takes a code from an untrusted redirect, so it is rate limited
// like any other unauthenticated entry point. Uses the project's own limiter
// rather than adding a dependency for one route.
const callbackLimiter = rateLimit('social_cb', 30, 10 * 60_000);

/** Send the creator back to their settings with a result they can read. */
function back(res, params) {
  const url = new URL('/settings', config.webBaseUrl);
  url.hash = 'connected-platforms';
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, String(v));
  return res.redirect(302, url.toString());
}

socialRouter.get('/callback/:platform', callbackLimiter, async (req, res) => {
  const platform = String(req.params.platform || '');
  if (!SOCIAL_PLATFORMS.includes(platform)) {
    return back(res, { social: platform, social_status: 'failed', social_reason: 'unknown_platform' });
  }

  // The creator pressed Cancel on the consent screen. Not an error worth a
  // scary message — just take them back.
  const denied = req.query.error || req.query.error_reason;
  if (denied) {
    return back(res, { social: platform, social_status: 'cancelled' });
  }

  const result = await completeConnection({
    platform,
    code: String(req.query.code || ''),
    state: String(req.query.state || ''),
  });

  return back(res, {
    social: platform,
    social_status: result.ok ? 'connected' : 'failed',
    // The reason is a short code, not the provider's raw error text — that text
    // can contain identifiers and belongs in the server log, not a URL bar.
    social_reason: result.ok ? undefined : 'not_completed',
  });
});
