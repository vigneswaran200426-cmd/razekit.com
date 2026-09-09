// @ts-nocheck
// Traffic verification + anti-fraud. Runs BEFORE scoring (spec §21): invalid or
// suspicious events must never improve a creator's Brand Traffic Score.
//
// Detection thresholds are deliberately NOT exposed to users (spec §37) — the
// API only ever reports a coarse verification_state.
import { createHash } from 'node:crypto';

export const STATE = {
  VERIFIED: 'verified',
  DUPLICATE: 'duplicate',
  SUSPICIOUS: 'suspicious',
  REJECTED: 'rejected',
};

// Same visitor + same link inside this window counts once.
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

const BOT_UA = /(bot|crawler|spider|slurp|curl|wget|python-requests|httpclient|headless|phantom|puppeteer|playwright|scrapy|monitor|preview|fetcher)/i;

/**
 * Pseudonymous visitor id. We never store a raw IP or user agent — only a
 * salted hash, so traffic can be de-duplicated without retaining personal data.
 */
export function visitorHash(ip, userAgent, salt) {
  return createHash('sha256').update(`${salt}|${ip || ''}|${userAgent || ''}`).digest('hex').slice(0, 32);
}

export function uaHash(userAgent, salt) {
  return createHash('sha256').update(`${salt}|${userAgent || ''}`).digest('hex').slice(0, 16);
}

export function dedupeKey(code, vhash, at = Date.now()) {
  return `${code}:${vhash}:${Math.floor(at / DEDUPE_WINDOW_MS)}`;
}

/**
 * Classify a click. Pure and deterministic so it is fully testable.
 *
 * @param link      the TrackingLink row
 * @param ctx       { userAgent, visitorHash, viewerUserId, recentByVisitor, seenDedupeKey }
 * @returns { state, reasons[] }  reasons are internal-only
 */
export function classifyClick(link, ctx) {
  const reasons = [];

  if (!link) return { state: STATE.REJECTED, reasons: ['unknown_code'] };
  if (link.status && link.status !== 'active') return { state: STATE.REJECTED, reasons: ['link_disabled'] };

  const ua = String(ctx.userAgent || '');
  if (!ua) reasons.push('missing_ua');
  if (BOT_UA.test(ua)) return { state: STATE.REJECTED, reasons: ['automated_agent'] };

  // A creator driving clicks to their own link earns nothing.
  if (ctx.viewerUserId && ctx.viewerUserId === link.creator_id) {
    return { state: STATE.REJECTED, reasons: ['self_click'] };
  }

  // Replay / refresh of the same visitor+link inside the window.
  if (ctx.seenDedupeKey) return { state: STATE.DUPLICATE, reasons: ['duplicate_within_window'] };

  // Burst from a single visitor across the window.
  if ((ctx.recentByVisitor || 0) >= 10) {
    return { state: STATE.SUSPICIOUS, reasons: ['visitor_burst'] };
  }

  if (reasons.length) return { state: STATE.SUSPICIOUS, reasons };
  return { state: STATE.VERIFIED, reasons: [] };
}

/** Only verified events count toward Brand Traffic. */
export function countsTowardScore(state) {
  return state === STATE.VERIFIED;
}
