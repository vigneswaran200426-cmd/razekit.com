// @ts-nocheck
// Upcoming poll campaigns — the community "do you want this tournament?" vote.
//
// A poll campaign is NOT a contest and must never be presented as one. It has
// no submissions, no duration, no scoring, no winner, no payout and no account
// handover. The prize-pool figure it carries describes the size of the
// tournament being PROPOSED; it is not money held, reserved, or promised by
// anyone, and nothing in this file touches the ledger. The three real creator
// contests live somewhere else entirely and share no code with this.
//
// What this file measures is one thing: how many real people said yes or no.
// So it refuses to invent that number. A poll with no votes reports 0, because
// zero recorded votes is a genuine measurement. A poll with no target reports
// progress as null, because a percentage of an unknown is not a measurement.
// A vote that looks automated is written down and left out of the tally rather
// than dropped — losing the evidence is worse than losing the vote.
//
// Reaching the target sets the poll to `voting_complete`. That is a statement
// about the vote, not a promise that the tournament happens; whether it runs is
// a separate business decision and no copy here may imply otherwise.
import { json } from './context.js';
import { withTransaction, lockRecord } from '../db.js';
import { serviceClient } from '../entities/service.js';
import { voterIdentity, assessVoteRisk, countsTowardTally } from '../polls/antiabuse.js';

const nowIso = () => new Date().toISOString();
const err = (code, message, status = 400) => json({ error: { code, message } }, status);

// Statuses a visitor may still vote in.
const OPEN_STATUSES = new Set(['upcoming', 'open', 'voting']);
// Statuses that mean "do not show this on the site at all".
const HIDDEN_STATUSES = new Set(['draft', 'hidden', 'archived', 'cancelled']);

// How many vote rows the admin integrity recount will read per poll. Past this
// the recount reports itself as incomplete rather than quietly comparing a
// sample against a full tally and calling the difference an attack.
const RECOUNT_CAP = 5000;

// Recent-activity samples used for risk assessment. Bounded so one vote never
// turns into an unbounded read at a million-vote scale.
const KEY_SAMPLE = 25;
const POLL_SAMPLE = 150;

/** Poll rows are ordered by an editor-controlled field, missing values last. */
function byDisplayOrder(a, b) {
  const av = Number.isFinite(Number(a?.display_order)) ? Number(a.display_order) : Number.MAX_SAFE_INTEGER;
  const bv = Number.isFinite(Number(b?.display_order)) ? Number(b.display_order) : Number.MAX_SAFE_INTEGER;
  if (av !== bv) return av - bv;
  return String(a?.slug || '').localeCompare(String(b?.slug || ''));
}

function isOpen(poll, at = Date.now()) {
  if (!OPEN_STATUSES.has(String(poll?.status || ''))) return false;
  const opens = Date.parse(poll?.opens_at || '');
  if (Number.isFinite(opens) && at < opens) return false;
  const closes = Date.parse(poll?.closes_at || '');
  if (Number.isFinite(closes) && at > closes) return false;
  return true;
}

/**
 * Progress toward the vote target, as a percentage.
 *
 * Returns null when there is no target to measure against — an unmeasurable
 * quantity is not 0%. When there IS a target, 0 is returned honestly: nobody
 * having voted yet is a real result. Kept to four decimals so that early, real
 * progress against a million-vote target does not round away into a fake zero.
 */
function progressPct(total, target) {
  const t = Number(target);
  if (!Number.isFinite(t) || t <= 0) return null;
  const n = Math.max(0, Number(total) || 0);
  const pct = (n / t) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10000) / 10000;
}

/**
 * The public shape of a poll.
 *
 * Deliberately narrow. `kind` is included so the frontend can assert at render
 * time that it is not about to draw a poll inside a contest list — the one
 * confusion this whole feature must never cause.
 *
 * Note what is absent: no risk score, no counted/uncounted split, no voter
 * counts by source. Those are how an attacker would calibrate; they live in
 * pollAdminList behind an admin check.
 */
function publicPoll(poll, myVote = null) {
  const yes = Math.max(0, Number(poll.yes_votes) || 0);
  const no = Math.max(0, Number(poll.no_votes) || 0);
  // Derived rather than trusted: yes + no IS the total, so a drifted stored
  // counter can never become the number shown to the public.
  const total = yes + no;
  return {
    kind: 'poll_campaign',
    id: poll.id,
    slug: poll.slug,
    title: poll.title,
    theme: poll.theme || null,
    question: poll.question || null,
    supporting_line: poll.supporting_line || null,
    cta_label: poll.cta_label || null,
    banner_url: poll.banner_url || null,
    banner_alt: poll.banner_alt || null,
    status: poll.status,
    is_open: isOpen(poll),
    requires_auth: poll.requires_auth !== false,
    prize_pool_minor: poll.prize_pool_minor ?? null,
    currency: poll.currency || 'INR',
    vote_target: poll.vote_target ?? null,
    yes_votes: yes,
    no_votes: no,
    total_votes: total,
    progress_pct: progressPct(total, poll.vote_target),
    target_reached_at: poll.target_reached_at || null,
    opens_at: poll.opens_at || null,
    closes_at: poll.closes_at || null,
    disclosure: poll.disclosure || null,
    my_vote: myVote || null,
  };
}

/**
 * What this caller already voted, keyed by poll id.
 *
 * Runs for anonymous visitors too: they are identified by exactly the key that
 * governs their vote, so showing them their own choice is consistent with the
 * rule that decides whether they may cast another one. Never reveals whether
 * the vote was counted — that is the detection signal.
 */
async function myVotesByPoll(ctx) {
  try {
    const { key } = voterIdentity({ user: ctx.user, req: ctx.req });
    const rows = await ctx.svc.entities.PollVote.filter({ voter_key: key }, '-created_date', 50);
    const map = new Map();
    for (const v of rows) if (!map.has(v.poll_id)) map.set(v.poll_id, v.choice);
    return map;
  } catch {
    // Not knowing the caller's previous choice degrades the UI; it must never
    // take the poll list down.
    return new Map();
  }
}

// ── pollList ────────────────────────────────────────────────────────────────
/**
 * PUBLIC. The upcoming poll campaigns, in the order an editor set.
 *
 * No authentication: the whole point is to ask the community, and asking people
 * to sign up before they can even see the question defeats it. Signing in only
 * changes one thing — we can tell you what you already picked.
 */
export async function pollList(ctx) {
  const rows = await ctx.svc.entities.PollCampaign.filter({}, '-created_date', 200).catch(() => []);
  const visible = rows.filter((p) => !HIDDEN_STATUSES.has(String(p.status || ''))).sort(byDisplayOrder);

  const mine = await myVotesByPoll(ctx);

  return json({
    polls: visible.map((p) => publicPoll(p, mine.get(p.id) || null)),
    server_time: nowIso(),
  });
}

/**
 * Serializable transactions can abort under contention rather than return a
 * wrong answer. That is the correct behaviour and the wrong thing to show a
 * voter, so a conflict is retried a couple of times before it becomes an error.
 * Only serialization/deadlock failures are retried — a genuine error is raised
 * immediately rather than run twice.
 */
function isSerializationFailure(e) {
  const text = `${e?.code || ''} ${e?.message || ''}`.toLowerCase();
  return text.includes('40001') || text.includes('40p01')
    || text.includes('could not serialize') || text.includes('write conflict') || text.includes('deadlock');
}

async function withRetry(fn, attempts = 6) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (!isSerializationFailure(e)) throw e;
      last = e;
      // Backoff with jitter, and both halves matter. Retrying immediately makes
      // contending voters collide again at the same instant; retrying after a
      // FIXED delay keeps them in lockstep and they collide again together.
      // The random component is what actually breaks up the convoy.
      if (i < attempts - 1) {
        const base = 15 * 2 ** i;
        await new Promise((r) => setTimeout(r, base + Math.floor(Math.random() * base)));
      }
    }
  }
  throw last;
}

// ── pollVote ────────────────────────────────────────────────────────────────
/**
 * Cast — or change — one vote.
 *
 * The rule, decided here and enforced here: an authenticated account votes as
 * itself; where the poll allows anonymous voting, a visitor votes by a derived,
 * non-reversible key. Either way it is ONE vote per key per poll. A repeat of
 * the same choice increments nothing and returns what is already on file with
 * `changed: false`. A different choice moves one vote from one side to the
 * other, so the total is untouched — a voter may change their mind, never
 * inflate the count.
 *
 * The read-modify-write of the tallies happens inside one transaction with the
 * poll row locked, so two votes arriving in the same millisecond cannot both
 * read 41 and both write 42. This is the same pattern financeVerifyFunding uses
 * for money, for the same reason: the second caller must block, re-read, and
 * see what the first one did.
 */
export async function pollVote(ctx) {
  const body = ctx.body || {};
  const slug = String(body.slug || '').trim().toLowerCase();
  const choice = String(body.choice || '').trim().toLowerCase();

  if (!slug) return err('SLUG_REQUIRED', 'Which poll is this vote for?');
  if (choice !== 'yes' && choice !== 'no') return err('CHOICE_REQUIRED', 'A vote is either yes or no.');

  const svc = ctx.svc;
  // Oldest first: if a seed ever ran twice, votes keep landing on the original
  // row rather than migrating to a duplicate and splitting the count.
  const matches = await svc.entities.PollCampaign.filter({ slug }, 'created_date', 5).catch(() => []);
  const poll = matches[0];
  if (!poll || HIDDEN_STATUSES.has(String(poll.status || ''))) {
    return err('POLL_NOT_FOUND', 'That poll is not available.', 404);
  }
  if (poll.requires_auth !== false && !ctx.user?.id) {
    return err('SIGN_IN_REQUIRED', 'Sign in to vote in this poll.', 401);
  }

  const identity = voterIdentity({ user: ctx.user, req: ctx.req });

  // Evidence for the risk assessment. Read outside the transaction on purpose:
  // these are advisory signals, and holding the poll row lock while gathering
  // them would serialise every voter behind two extra queries.
  const [recentByKey, recentInPoll] = await Promise.all([
    svc.entities.PollVote.filter({ voter_key: identity.key }, '-created_date', KEY_SAMPLE).catch(() => []),
    svc.entities.PollVote.filter({ poll_id: poll.id }, '-created_date', POLL_SAMPLE).catch(() => []),
  ]);
  const risk = assessVoteRisk({
    req: ctx.req,
    user: ctx.user,
    recentVotesByKey: recentByKey,
    recentVotesInPoll: recentInPoll,
  });

  let outcome;
  try {
    outcome = await withRetry(() => withTransaction(async (tx) => {
    const txSvc = serviceClient(tx);
    // The lock is what serialises two simultaneous votes on the same poll.
    await lockRecord(tx, poll.id);

    const fresh = await txSvc.entities.PollCampaign.get(poll.id).catch(() => null);
    if (!fresh) return { conflict: err('POLL_NOT_FOUND', 'That poll is not available.', 404) };

    // Re-read inside the lock: a concurrent first vote from the same key lands
    // here and must see it, or one voter gets two votes.
    const existing = (await txSvc.entities.PollVote
      .filter({ poll_id: fresh.id, voter_key: identity.key }, 'created_date', 1)
      .catch(() => []))[0] || null;

    const open = isOpen(fresh);

    if (!open && !existing) {
      return { conflict: err('POLL_CLOSED', 'Voting on this poll has closed.', 409) };
    }
    // Closed, but this person already voted: show them what stands rather than
    // erroring at someone who did nothing wrong.
    if (!open) return { poll: fresh, vote: existing, changed: false };

    // Same choice again — a double click, a retry, a refresh. Nothing moves.
    if (existing && existing.choice === choice) {
      return { poll: fresh, vote: existing, changed: false };
    }

    const yes = Math.max(0, Number(fresh.yes_votes) || 0);
    const no = Math.max(0, Number(fresh.no_votes) || 0);

    if (existing) {
      // A change of mind. `counted` was decided when the vote was first
      // recorded and is not revisited here: re-judging it could pull a vote
      // back out of the public total, and a total that can go down on a later
      // request is a total nobody can reconcile. The newer risk assessment is
      // still written to the row so an operator sees the pattern escalating.
      const wasCounted = existing.counted !== false;
      const nextYes = wasCounted ? (choice === 'yes' ? yes + 1 : Math.max(0, yes - 1)) : yes;
      const nextNo = wasCounted ? (choice === 'no' ? no + 1 : Math.max(0, no - 1)) : no;

      const updatedPoll = wasCounted
        ? await txSvc.entities.PollCampaign.update(fresh.id, {
            yes_votes: nextYes,
            no_votes: nextNo,
            total_votes: nextYes + nextNo,
          })
        : fresh;

      const mergedReasons = [...new Set([...(existing.risk_reasons || []), ...risk.reasons])];
      const updatedVote = await txSvc.entities.PollVote.update(existing.id, {
        choice,
        risk_score: Math.max(Number(existing.risk_score) || 0, risk.score),
        risk_reasons: mergedReasons,
        voted_at: nowIso(),
      });

      return { poll: updatedPoll, vote: updatedVote, changed: true };
    }

    // A new vote. High-risk votes are written down in full and left out of the
    // tally — the row is the evidence that an attack happened.
    const counted = countsTowardTally(risk.score);
    const nextYes = counted && choice === 'yes' ? yes + 1 : yes;
    const nextNo = counted && choice === 'no' ? no + 1 : no;
    const nextTotal = nextYes + nextNo;

    const vote = await txSvc.entities.PollVote.create({
      poll_id: fresh.id,
      choice,
      voter_key: identity.key,
      user_id: ctx.user?.id || null,
      counted,
      risk_score: risk.score,
      risk_reasons: risk.reasons,
      ip_hash: identity.ip_hash,
      user_agent_hash: identity.user_agent_hash,
      voted_at: nowIso(),
    });

    const patch = { yes_votes: nextYes, no_votes: nextNo, total_votes: nextTotal };

    // First time the target is met. Says the vote is finished, and nothing
    // more than that — whether the tournament runs is not decided here.
    const target = Number(fresh.vote_target);
    if (Number.isFinite(target) && target > 0 && nextTotal >= target && !fresh.target_reached_at) {
      patch.target_reached_at = nowIso();
      patch.status = 'voting_complete';
    }

      const updatedPoll = await txSvc.entities.PollCampaign.update(fresh.id, patch);
      return { poll: updatedPoll, vote, changed: true };
    }));
  } catch (e) {
    // Retries exhausted under heavy contention. A busy poll is not the voter's
    // problem to debug, and crashing the request would lose the vote silently —
    // so it is an explicit "try again", and nothing was written.
    if (isSerializationFailure(e)) {
      return err('POLL_BUSY', 'A lot of people are voting right now. Please try again in a moment.', 503);
    }
    throw e;
  }

  if (outcome.conflict) return outcome.conflict;

  // The response says what the voter chose and what the public numbers now are.
  // It does not say whether the vote was counted, or why: that is precisely the
  // feedback an attacker needs to tune around the filter.
  return json({
    poll: publicPoll(outcome.poll, outcome.vote?.choice || choice),
    my_vote: outcome.vote?.choice || choice,
    changed: Boolean(outcome.changed),
  });
}

// ── pollAdminList ───────────────────────────────────────────────────────────
/**
 * ADMIN. The polls plus the vote integrity behind them.
 *
 * This is how a human sees an attack: the split between votes that counted and
 * votes that were recorded and excluded, which signals fired most often, and
 * whether the stored tallies still agree with the votes on file.
 *
 * When there are more votes than the recount reads, it says so rather than
 * comparing a sample to a full tally and reporting the difference as a
 * discrepancy. A wrong integrity alarm is worse than an absent one.
 */
export async function pollAdminList(ctx) {
  if (ctx.user?.role !== 'admin') return err('FORBIDDEN', 'Admin access required.', 403);

  const svc = ctx.svc;
  const polls = (await svc.entities.PollCampaign.filter({}, '-created_date', 200).catch(() => []))
    .sort(byDisplayOrder);

  const rows = [];
  for (const poll of polls) {
    const votes = await svc.entities.PollVote
      .filter({ poll_id: poll.id }, '-created_date', RECOUNT_CAP)
      .catch(() => []);

    const complete = votes.length < RECOUNT_CAP;

    let counted = 0;
    let countedYes = 0;
    let countedNo = 0;
    let authenticated = 0;
    const reasonCounts = new Map();
    const keys = new Set();

    for (const v of votes) {
      keys.add(v.voter_key);
      if (v.user_id) authenticated += 1;
      if (v.counted !== false) {
        counted += 1;
        if (v.choice === 'yes') countedYes += 1;
        else if (v.choice === 'no') countedNo += 1;
      }
      for (const reason of v.risk_reasons || []) {
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      }
    }

    const topReasons = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([reason, count]) => ({ reason, count }));

    const stored = publicPoll(poll);

    rows.push({
      ...stored,
      integrity: {
        // Null, not zero, when we could not read every vote — an unknown is
        // not a measurement of zero.
        votes_examined: votes.length,
        recount_complete: complete,
        counted_votes: complete ? counted : null,
        uncounted_votes: complete ? votes.length - counted : null,
        unique_voter_keys: complete ? keys.size : null,
        authenticated_votes: complete ? authenticated : null,
        anonymous_votes: complete ? votes.length - authenticated : null,
        // Does the public tally still match the votes actually on file?
        tally_matches: complete
          ? countedYes === stored.yes_votes && countedNo === stored.no_votes
          : null,
        recounted_yes: complete ? countedYes : null,
        recounted_no: complete ? countedNo : null,
        top_risk_reasons: topReasons,
      },
    });
  }

  return json({ polls: rows, server_time: nowIso() });
}
