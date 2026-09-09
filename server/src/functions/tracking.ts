// @ts-nocheck
// Tracking-link issuance. A creator gets one unguessable link per submission;
// the destination always comes from the BRAND's contest, never from the caller,
// so a creator cannot point a razekit.com link anywhere they like.
import { json } from './context.js';
import { newTrackingCode } from '../traffic/service.js';

export async function trackingLinkCreate(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const { submission_id: submissionId } = ctx.body || {};
  if (!submissionId) return json({ error: 'submission_id is required' }, 400);

  const sub = await svc.entities.Submission.get(submissionId).catch(() => null);
  if (!sub) return json({ error: 'Submission not found' }, 404);

  // Only the creator who owns the submission may mint its link.
  if (sub.created_by_id !== user.id && user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const contest = await svc.entities.Contest.get(sub.contest_id).catch(() => null);
  if (!contest) return json({ error: 'Contest not found' }, 404);

  const destination = contest.brand_destination_url;
  if (!destination) {
    return json({
      error: {
        code: 'NO_DESTINATION',
        message: 'This brand has not set a campaign destination yet, so tracked links are unavailable.',
      },
    }, 409);
  }

  // Idempotent: one active link per submission.
  const existing = await svc.entities.TrackingLink.filter({ submission_id: submissionId }, '-created_date', 1).catch(() => []);
  if (existing.length) {
    return json({ code: existing[0].code, url: linkUrl(existing[0].code), existing: true });
  }

  const code = newTrackingCode();
  await svc.entities.TrackingLink.create({
    code,
    contest_id: contest.id,
    creator_id: sub.created_by_id,
    client_id: contest.created_by_id,
    submission_id: submissionId,
    destination_url: destination,
    platform: sub.platform || null,
    status: 'active',
  });
  return json({ code, url: linkUrl(code), existing: false });
}

function linkUrl(code) {
  const base = (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  return `${base}/r/${code}`;
}

/** Aggregated traffic for the caller's own scope. Raw events stay admin-only. */
export async function trackingLinkList(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const { contest_id: contestId } = ctx.body || {};

  const isAdmin = user.role === 'admin';
  let links = [];
  if (contestId) {
    const contest = await svc.entities.Contest.get(contestId).catch(() => null);
    if (!contest) return json({ error: 'Contest not found' }, 404);
    // Brand may see its own campaign's links; creators only their own.
    if (contest.created_by_id === user.id || isAdmin) {
      links = await svc.entities.TrackingLink.filter({ contest_id: contestId }, '-created_date', 500);
    } else {
      links = await svc.entities.TrackingLink.filter({ contest_id: contestId, creator_id: user.id }, '-created_date', 100);
    }
  } else {
    links = await svc.entities.TrackingLink.filter({ creator_id: user.id }, '-created_date', 200);
  }

  return json({
    links: links.map((l) => ({
      code: l.code, url: linkUrl(l.code), contest_id: l.contest_id, creator_id: l.creator_id,
      submission_id: l.submission_id, status: l.status,
      total_clicks: l.total_clicks || 0,
      verified_clicks: l.verified_clicks || 0,
      unique_visitors: l.unique_visitors || 0,
      // Coarse only — never the reasons, never the thresholds.
      excluded_clicks: l.suspicious_clicks || 0,
      last_click_at: l.last_click_at || null,
    })),
  });
}
