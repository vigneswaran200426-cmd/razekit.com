// @ts-nocheck
// Account handover — the two-party confirmation that gates payout eligibility.
//
// This file exists because of a regression I caused. Handover.status,
// winner_id, client_id, contest_id and completed_at were made server-only for a
// good reason — a winner marking their own handover COMPLETED would be claiming
// that somebody received an account nobody confirmed receiving, and completion
// gates payout. But the browser was the only thing driving the state machine:
// Handover.jsx called entities.Handover.create() and .update() with exactly
// those fields. Protecting them turned every action on that screen into a
// silent 403 — "Start handover" did nothing, "Confirm" did nothing, and sending
// a message cleared the composer and threw the text away.
//
// The fix is not to unprotect the fields. It is to move the decision to where
// it belonged in the first place. The browser now states an intent —
// start / confirm / send — and the server decides what that means:
//
//   · who the two parties are comes from the CONTEST, never from the request
//   · a caller may only confirm on their OWN side
//   · the resulting status is computed here; no client proposes one
//   · sender_role is derived from identity, not accepted as a claim
//
// Confirmation runs inside a transaction with a row lock, because both parties
// can confirm at the same moment. Read-modify-write without the lock lets each
// side read the other's flag as false and write a status that says only one has
// confirmed, which would strand a completed handover short of payout.
import { json } from './context.js';
import { withTransaction, lockRecord } from '../db.js';
import { serviceClient } from '../entities/service.js';

const nowIso = () => new Date().toISOString();
const err = (code, message, status = 400, extra = {}) => json({ error: { code, message, ...extra } }, status);

const STATUS = {
  INITIATED: 'initiated',
  IN_PROGRESS: 'in_progress',
  WINNER_CONFIRMED: 'winner_confirmed',
  COMPLETED: 'completed',
};

/**
 * Which side of this handover the caller is on.
 *
 * Read from the stored row, never from the request body. A request that says
 * "I am the client" is a claim; the row is the fact.
 */
function sideOf(handover, userId) {
  if (handover.client_id === userId) return 'client';
  if (handover.winner_id === userId) return 'winner';
  return null;
}

/** Start the handover for a contest, or return the one already started. */
export async function handoverStart(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { contest_id: contestId } = ctx.body || {};
  if (!contestId) return err('CONTEST_ID_REQUIRED', 'contest_id is required.');

  const contest = await ctx.svc.entities.Contest.get(contestId).catch(() => null);
  if (!contest) return err('CONTEST_NOT_FOUND', 'Contest not found.', 404);
  if (!contest.winner_user_id) {
    return err('NO_WINNER_YET', 'A winner has to be selected before a handover can start.', 409);
  }

  // The two parties are whoever the contest says they are.
  const clientId = contest.created_by_id;
  const winnerId = contest.winner_user_id;
  if (ctx.user.id !== clientId && ctx.user.id !== winnerId) {
    return err('FORBIDDEN', 'Only the brand and the winning creator can open this handover.', 403);
  }

  const svc = serviceClient();
  // Idempotent: a double click, or both parties pressing start at once, must
  // not produce two handovers for one contest.
  const existing = await svc.entities.Handover.filter({ contest_id: contestId }, '-created_date', 1).catch(() => []);
  if (existing?.length) return json({ handover: existing[0], created: false });

  const handover = await svc.entities.Handover.create({
    contest_id: contestId,
    contest_title: contest.title,
    client_id: clientId,
    winner_id: winnerId,
    status: STATUS.INITIATED,
    started_at: nowIso(),
    creator_confirmation: false,
    client_confirmation: false,
  });
  return json({ handover, created: true });
}

/**
 * Record the caller's confirmation, and decide what the handover now is.
 *
 * A caller can only ever set their own side. The status that results is
 * computed from both flags after the write, not proposed by the client.
 */
export async function handoverConfirm(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { handover_id: id } = ctx.body || {};
  if (!id) return err('HANDOVER_ID_REQUIRED', 'handover_id is required.');

  const preview = await ctx.svc.entities.Handover.get(id).catch(() => null);
  if (!preview) return err('HANDOVER_NOT_FOUND', 'Handover not found.', 404);
  if (!sideOf(preview, ctx.user.id)) {
    return err('FORBIDDEN', 'This handover belongs to another brand and creator.', 403);
  }

  const out = await withTransaction(async (tx) => {
    const svc = serviceClient(tx);
    await lockRecord(tx, id);
    const h = await svc.entities.Handover.get(id);
    const side = sideOf(h, ctx.user.id);
    if (!side) return { conflict: err('FORBIDDEN', 'This handover belongs to another brand and creator.', 403) };
    if (h.status === STATUS.COMPLETED) {
      // Already done is not an error worth alarming anyone about.
      return { handover: h, alreadyComplete: true };
    }

    const patch = {};
    if (side === 'winner') {
      if (h.creator_confirmation) return { handover: h, alreadyConfirmed: true };
      patch.creator_confirmation = true;
      patch.creator_confirmed_at = nowIso();
    } else {
      if (h.client_confirmation) return { handover: h, alreadyConfirmed: true };
      patch.client_confirmation = true;
      patch.client_confirmed_at = nowIso();
    }

    // Both flags AFTER this write — read under the lock, so a simultaneous
    // confirmation from the other side cannot be missed.
    const winnerDone = side === 'winner' ? true : Boolean(h.creator_confirmation);
    const clientDone = side === 'client' ? true : Boolean(h.client_confirmation);
    const both = winnerDone && clientDone;

    patch.status = both ? STATUS.COMPLETED
      : winnerDone ? STATUS.WINNER_CONFIRMED
      : STATUS.IN_PROGRESS;
    if (both) patch.completed_at = nowIso();

    const handover = await svc.entities.Handover.update(id, patch);

    // Completing the handover completes the contest. Done with the same service
    // client inside the same transaction, so the two cannot disagree.
    if (both && h.contest_id) {
      await svc.entities.Contest.update(h.contest_id, {
        status: 'completed',
        completed_at: nowIso(),
      }).catch(() => {});
    }
    return { handover, completed: both };
  });

  if (out?.conflict) return out.conflict;
  return json(out);
}

/** Post a message into the handover room. */
export async function handoverSend(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { handover_id: id, body } = ctx.body || {};
  if (!id) return err('HANDOVER_ID_REQUIRED', 'handover_id is required.');
  const text = String(body || '').trim();
  if (!text) return err('MESSAGE_REQUIRED', 'Type a message before sending.');
  if (text.length > 4000) return err('MESSAGE_TOO_LONG', 'Messages are limited to 4000 characters.');

  const handover = await ctx.svc.entities.Handover.get(id).catch(() => null);
  if (!handover) return err('HANDOVER_NOT_FOUND', 'Handover not found.', 404);
  const side = sideOf(handover, ctx.user.id);
  if (!side) return err('FORBIDDEN', 'This handover belongs to another brand and creator.', 403);

  const svc = serviceClient();
  // Every routing field is taken from the handover row and the caller's
  // identity. A client that could set sender_role could put words in the other
  // party's mouth in a conversation that decides whether a payout is owed.
  const message = await svc.entities.HandoverMessage.create({
    handover_id: id,
    contest_id: handover.contest_id,
    client_id: handover.client_id,
    winner_id: handover.winner_id,
    sender_id: ctx.user.id,
    sender_role: side === 'client' ? 'client' : 'creator',
    body: text,
  });
  return json({ message });
}
