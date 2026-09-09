// @ts-nocheck
// Traffic recording. Called from the public redirect endpoint; writes through
// the SERVICE role because TrafficEvent/TrackingLink are server-owned.
import { randomBytes, createHash } from 'node:crypto';
import { serviceClient } from '../entities/service.js';
import { classifyClick, countsTowardScore, visitorHash, uaHash, dedupeKey, STATE } from './fraud.js';

// Salt for pseudonymous visitor hashing. Derived from JWT_SECRET so it is
// stable across restarts but never a hard-coded constant.
const SALT = createHash('sha256').update(`rk-traffic|${process.env.JWT_SECRET || 'dev'}`).digest('hex');

/** URL-safe, unguessable tracking code. */
export function newTrackingCode() {
  return randomBytes(9).toString('base64url'); // 12 chars
}

export async function resolveLink(code) {
  if (!code || !/^[A-Za-z0-9_-]{6,32}$/.test(code)) return null;
  const svc = serviceClient();
  const rows = await svc.entities.TrackingLink.filter({ code }, '-created_date', 1).catch(() => []);
  return rows[0] || null;
}

/**
 * Record a click and return the classification.
 * Never throws into the request path — a tracking failure must not stop the
 * visitor from reaching the brand.
 */
export async function recordClick({ code, ip, userAgent, referrer, viewerUserId, now = Date.now() }) {
  const svc = serviceClient();
  const link = await resolveLink(code);
  if (!link) return { link: null, state: STATE.REJECTED };

  const vhash = visitorHash(ip, userAgent, SALT);
  const key = dedupeKey(code, vhash, now);

  // Has this exact visitor+link+window already been counted?
  const dupes = await svc.entities.TrafficEvent.filter({ dedupe_key: key }, '-created_date', 1).catch(() => []);
  // How active has this visitor been on this link recently?
  const recent = await svc.entities.TrafficEvent.filter({ visitor_hash: vhash, tracking_code: code }, '-created_date', 25).catch(() => []);

  const { state, reasons } = classifyClick(link, {
    userAgent, visitorHash: vhash, viewerUserId,
    seenDedupeKey: dupes.length > 0,
    recentByVisitor: recent.length,
  });

  let referrerHost = null;
  try { if (referrer) referrerHost = new URL(referrer).hostname.slice(0, 120); } catch {}

  const isUnique = state === STATE.VERIFIED && recent.length === 0;

  await svc.entities.TrafficEvent.create({
    tracking_code: code,
    contest_id: link.contest_id,
    creator_id: link.creator_id,
    client_id: link.client_id || null,
    submission_id: link.submission_id || null,
    occurred_at: new Date(now).toISOString(),
    visitor_hash: vhash,
    ua_hash: uaHash(userAgent, SALT),
    referrer_host: referrerHost,
    verification_state: state,
    risk_reasons: JSON.stringify(reasons || []),
    dedupe_key: key,
    is_unique: isUnique,
  }).catch(() => null);

  // Maintain denormalized counters so Tracker never scans raw events.
  const patch = { total_clicks: (link.total_clicks || 0) + 1, last_click_at: new Date(now).toISOString() };
  if (countsTowardScore(state)) {
    patch.verified_clicks = (link.verified_clicks || 0) + 1;
    if (isUnique) patch.unique_visitors = (link.unique_visitors || 0) + 1;
  } else if (state === STATE.SUSPICIOUS || state === STATE.REJECTED) {
    patch.suspicious_clicks = (link.suspicious_clicks || 0) + 1;
  }
  await svc.entities.TrackingLink.update(link.id, patch).catch(() => null);

  return { link, state };
}
