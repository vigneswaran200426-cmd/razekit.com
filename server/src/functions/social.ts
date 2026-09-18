// @ts-nocheck
// Creator-facing social connection endpoints.
//
// Everything here is scoped to the signed-in creator. A creator connects the
// platforms they want tracked and no others, and can withdraw any of them at
// any time — RazeKit reads exactly what they authorized.
import { json } from './context.js';
import { listConnections, startConnection, disconnect } from '../social/connect.js';
import { syncPost, isFresh } from '../social/sync.js';
import { capabilityMatrix } from '../social/adapters/index.js';

const err = (code, message, status = 400) => json({ error: { code, message } }, status);

/**
 * Every platform's state for this creator: available, connected, and what each
 * one can actually measure.
 */
export async function socialConnections(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const connections = await listConnections(ctx.svc, ctx.user.id);
  return json({ connections });
}

/** Begin authorization. Returns the provider's consent URL for the browser. */
export async function socialConnectStart(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const platform = String(ctx.body?.platform || '');
  const r = startConnection(ctx.user.id, platform);
  if (!r.ok) return err('PLATFORM_UNAVAILABLE', r.reason || 'This platform cannot be connected.', 400);
  return json({ authorize_url: r.authorizeUrl });
}

// The provider's redirect is handled by social/routes.ts (GET
// /api/social/callback/:platform), not here — the function router is POST-only
// and the creator needs redirecting back into the app, not a JSON body.

/** Withdraw authorization for one platform. */
export async function socialDisconnect(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const platform = String(ctx.body?.platform || '');
  const ok = await disconnect(ctx.svc, ctx.user.id, platform);
  if (!ok) return err('NOT_CONNECTED', 'That platform is not connected.', 404);
  return json({ disconnected: true, platform });
}

/**
 * Refresh one submitted post on demand.
 *
 * Cooldown-guarded: providers meter reads, and a refresh button with no cooldown
 * is a way for one impatient creator to exhaust a quota shared by everyone.
 */
export async function socialSyncPost(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);

  const submissionId = String(ctx.body?.submission_id || '');
  if (!submissionId) return err('SUBMISSION_REQUIRED', 'A submission is required.', 400);

  const submission = await ctx.svc.entities.Submission.get(submissionId).catch(() => null);
  if (!submission) return err('NOT_FOUND', 'Submission not found.', 404);

  // A creator may refresh only their own submission. The brand sees whatever
  // the scheduled sync produced; it is not theirs to trigger.
  if (String(submission.created_by_id) !== String(ctx.user.id)) {
    return err('FORBIDDEN', 'You can only refresh your own submission.', 403);
  }

  if (isFresh(submission.url_checked_at)) {
    return json({
      outcome: 'fresh',
      message: 'These figures were updated recently. Try again in a little while.',
    });
  }

  const result = await syncPost({
    creatorId: ctx.user.id,
    platform: submission.platform,
    postUrl: submission.live_url,
    contestId: submission.contest_id,
    submissionId: submission.id,
  });

  return json(result);
}

/**
 * The public capability matrix.
 *
 * Deliberately readable without a session: a creator deciding whether to enter
 * a contest, and a brand deciding which platform to run it on, both need to
 * know that Reddit cannot report views before they commit. It exposes no
 * credentials and no user data — only what each API can measure.
 */
export async function socialCapabilities() {
  return json({
    platforms: capabilityMatrix().map((p) => ({
      platform: p.platform,
      api: p.apiName,
      available: p.configured,
      metrics: p.metrics,
    })),
  });
}
