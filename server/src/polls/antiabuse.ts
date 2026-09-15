// Who a poll voter is, and how much their vote smells like automation.
//
// An upcoming-poll vote is the cheapest thing on RazeKit to forge: no account is
// necessarily required, no money moves, and the only thing at stake is whether a
// number printed next to "do you want this tournament?" is true. That is exactly
// why it needs defending — an inflated vote count is a lie told to the community
// and to whoever later decides whether to run the tournament.
//
// This module is PURE: no database, no request mutation, no randomness, no
// clock it cannot be handed. It answers two questions and nothing else.
//
// It refuses to do two things:
//   • store or return anything reversible to a person — IP and user agent only
//     ever leave here as salted hashes;
//   • publish its own limits. Every number below stays server-side, because an
//     attacker who can read the threshold simply parks one point underneath it.
//     Nothing in this file may be serialised into an API response.
import { createHash } from 'node:crypto';

/** Minimal structural view of an Express request — keeps this file dependency-free. */
export interface VoteRequestLike {
  ip?: string;
  headers?: Record<string, unknown>;
}

export interface VoterLike {
  id?: string | null;
}

export interface VoterInput {
  user?: VoterLike | null;
  req?: VoteRequestLike | null;
}

/** A recorded vote, as much of one as the risk assessment actually reads. */
export interface VoteRowLike {
  voted_at?: string | null;
  created_date?: string | null;
}

export interface RiskInput {
  req?: VoteRequestLike | null;
  user?: VoterLike | null;
  /** Recent votes carrying this voter's key — a count, or the rows themselves. */
  recentVotesByKey?: number | VoteRowLike[] | null;
  /**
   * Recent votes on the poll as a whole, from everyone. Optional: when the
   * caller cannot afford the query it is simply not a signal, rather than a
   * guessed one.
   */
  recentVotesInPoll?: number | VoteRowLike[] | null;
  /** Injectable clock so the windowing is testable without waiting. */
  now?: number;
}

export interface RiskAssessment {
  score: number;
  reasons: string[];
}

// ── Internal limits. Never serialised, never returned, never logged. ─────────

/** Clients that announce themselves as software rather than as a person. */
const BOT_UA = /(bot|crawler|spider|slurp|curl|wget|python-requests|httpclient|okhttp|java\/|go-http|libwww|axios|node-fetch|headless|phantom|puppeteer|playwright|selenium|scrapy|monitor|preview|fetcher)/i;

/** Every real browser user agent names an engine and a platform; nothing real is this short. */
const MIN_PLAUSIBLE_UA = 24;

/** How far back "recent" reaches when the caller hands over rows rather than a count. */
const RECENT_WINDOW_MS = 10 * 60_000;

// There are three poll campaigns, so one voter key legitimately produces at
// most three votes. Anything beyond that inside ten minutes is someone cycling,
// not someone deciding.
const REPEAT_SOFT = 4;
const REPEAT_HARD = 8;

/** A surge on the poll itself is weak evidence about any single voter — it gets weak weight. */
const POLL_BURST = 150;

const WEIGHT = {
  automated_agent: 70,
  missing_user_agent: 50,
  unusual_user_agent: 25,
  no_account: 25,
  repeat_votes_from_key: 30,
  rapid_repeat_votes: 60,
  poll_wide_burst: 10,
} as const;

/**
 * Votes scoring at or above this are RECORDED but NOT COUNTED.
 *
 * Recorded, not dropped: a silently discarded vote destroys the only evidence
 * that an attack happened. The row survives with its score and reasons so a
 * human can look at the pattern in the admin view.
 *
 * Calibrated so an ordinary anonymous visitor on a real browser stays well
 * below it — anonymous voting has to actually work, or the measurement is
 * worthless.
 */
export const COUNT_THRESHOLD = 70;

// ── Identity ────────────────────────────────────────────────────────────────

/**
 * The hashing salt.
 *
 * Read at call time, not at import time, so a deployment can rotate it and so
 * tests can pin it. `POLL_VOTE_SALT` is the real setting; the fallback is
 * derived from JWT_SECRET rather than being a hard-coded constant, so a
 * deployment that forgot the variable still produces deployment-specific,
 * unguessable keys instead of globally predictable ones.
 *
 * Rotating the salt re-anonymises every anonymous voter, which means they can
 * vote once more. That is the intended trade: the salt is a privacy control,
 * not a counting control.
 */
function voteSalt(): string {
  const explicit = process.env.POLL_VOTE_SALT;
  if (explicit && explicit.length >= 8) return explicit;
  return createHash('sha256').update(`rk-poll|${process.env.JWT_SECRET || 'dev'}`).digest('hex');
}

function sha(input: string, length = 32): string {
  return createHash('sha256').update(input).digest('hex').slice(0, length);
}

function header(req: VoteRequestLike | null | undefined, name: string): string {
  const v = req?.headers?.[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return '';
}

/** The caller's address, taken from the proxy header the platform actually sits behind. */
function clientIp(req: VoteRequestLike | null | undefined): string {
  const forwarded = header(req, 'x-forwarded-for');
  return forwarded.split(',')[0]?.trim() || req?.ip || '';
}

function userAgent(req: VoteRequestLike | null | undefined): string {
  return header(req, 'user-agent');
}

/**
 * A stable, non-reversible identifier for one voter.
 *
 * An authenticated account is the identity we prefer, because it is the only
 * one that is actually accountable. Everyone else is identified by a salted
 * hash of address plus user agent — never the raw values, which are personal
 * data we have no reason to keep.
 *
 * The two namespaces are prefixed so a derived key can never collide with an
 * account key, and so an operator reading a row can tell which kind it is
 * without being able to work backwards to a person.
 *
 * Known and accepted limit: visitors sharing one address and one browser build
 * — an office, a campus, a carrier NAT — derive the same key and therefore
 * share one vote. That undercounts. Undercounting is the safe direction; the
 * alternative is a number nobody can defend.
 */
export function voterKey({ user, req }: VoterInput): string {
  const salt = voteSalt();
  const id = user?.id;
  if (id) return `u:${sha(`${salt}|user|${id}`)}`;
  return `a:${sha(`${salt}|anon|${clientIp(req)}|${userAgent(req)}`)}`;
}

export interface VoterIdentity {
  key: string;
  ip_hash: string | null;
  user_agent_hash: string | null;
  anonymous: boolean;
}

/**
 * Everything the vote row is allowed to store about a voter.
 *
 * The hashes exist so an operator investigating an attack can group votes that
 * came from one place, and for nothing else. There is no path back to an IP.
 */
export function voterIdentity({ user, req }: VoterInput): VoterIdentity {
  const salt = voteSalt();
  const ip = clientIp(req);
  const ua = userAgent(req);
  return {
    key: voterKey({ user, req }),
    ip_hash: ip ? sha(`${salt}|ip|${ip}`, 24) : null,
    user_agent_hash: ua ? sha(`${salt}|ua|${ua}`, 16) : null,
    anonymous: !user?.id,
  };
}

// ── Risk ────────────────────────────────────────────────────────────────────

/**
 * Count rows falling inside the recent window.
 *
 * A row with no usable timestamp counts: discarding it would let an attacker
 * hide repeats simply by omitting the field.
 */
function countRecent(input: number | VoteRowLike[] | null | undefined, now: number): number {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? Math.floor(input) : 0;
  if (!Array.isArray(input)) return 0;
  let n = 0;
  for (const row of input) {
    const at = Date.parse(String(row?.voted_at || row?.created_date || ''));
    if (!Number.isFinite(at) || now - at <= RECENT_WINDOW_MS) n += 1;
  }
  return n;
}

/**
 * How much this vote looks like automation rather than a person.
 *
 * Additive rather than rule-based on purpose: no single ordinary trait is
 * enough to discard someone's opinion, but several together are. Voting without
 * an account is a signal, not a verdict — most honest voters will be anonymous,
 * and the weights are set so an anonymous visitor on a real browser is counted.
 *
 * `reasons` are internal slugs for the admin view. They never reach a public
 * response, and neither does `score`: telling an attacker which signal fired is
 * telling them what to change.
 */
export function assessVoteRisk({
  req,
  user,
  recentVotesByKey,
  recentVotesInPoll,
  now = Date.now(),
}: RiskInput): RiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  const add = (reason: keyof typeof WEIGHT) => {
    reasons.push(reason);
    score += WEIGHT[reason];
  };

  const ua = userAgent(req).trim();
  if (!ua) add('missing_user_agent');
  else if (BOT_UA.test(ua)) add('automated_agent');
  else if (ua.length < MIN_PLAUSIBLE_UA) add('unusual_user_agent');

  // No account means nothing is accountable behind this vote. Weighted low
  // because anonymous voting is allowed by design where a poll permits it.
  if (!user?.id) add('no_account');

  const byKey = countRecent(recentVotesByKey, now);
  if (byKey >= REPEAT_SOFT) add('repeat_votes_from_key');
  if (byKey >= REPEAT_HARD) add('rapid_repeat_votes');

  if (countRecent(recentVotesInPoll, now) >= POLL_BURST) add('poll_wide_burst');

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

/** Whether a vote at this risk level moves the public tally. */
export function countsTowardTally(score: number): boolean {
  return Number.isFinite(score) && score < COUNT_THRESHOLD;
}
