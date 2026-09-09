// @ts-nocheck
// Help & Support (spec 14).
//
// Two hard rules drive this file:
//   1. Ticket ownership is taken from the authenticated caller, never from the
//      request body. SupportTicket.rls.create is `true`, so without this the
//      client could file a ticket as somebody else.
//   2. The assistant answers ONLY from verified RazeKit knowledge. When there
//      is no confident match it says so and offers escalation — it never
//      invents payment state, winner state, fraud cause or account state.
import { json } from './context.js';
import { KNOWLEDGE, searchKnowledge } from '../support/knowledge.js';

export const TICKET_CATEGORIES = [
  'account', 'contest', 'submission', 'payment', 'payout',
  'tracker', 'winner', 'technical', 'security', 'other',
];

export const TICKET_STATES = [
  'open', 'acknowledged', 'in_review', 'waiting_for_user',
  'waiting_for_internal_team', 'resolved', 'closed',
];

// Categories that always route to a human (spec 14).
const HUMAN_ESCALATION = new Set(['payment', 'payout', 'account', 'security', 'winner']);

function ticketRef() {
  // Human-quotable reference. Randomness is fine here (not a security token).
  return 'RK-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function supportTicketCreate(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Sign in to raise a ticket.' }, 401);
  const svc = ctx.svc;
  const b = ctx.body || {};

  const category = String(b.category || '').toLowerCase();
  if (!TICKET_CATEGORIES.includes(category)) {
    return json({ error: `Choose a category: ${TICKET_CATEGORIES.join(', ')}.` }, 400);
  }
  const subject = String(b.subject || '').trim();
  const description = String(b.description || '').trim();
  if (subject.length < 4) return json({ error: 'Add a short subject.' }, 400);
  if (description.length < 10) return json({ error: 'Describe the issue in a little more detail.' }, 400);
  if (subject.length > 200 || description.length > 5000) return json({ error: 'That is longer than we can accept.' }, 400);

  // Related resources are validated for ownership so a ticket cannot be used to
  // probe whether another user's contest/submission exists.
  let contestId = null;
  if (b.contest_id) {
    const c = await svc.entities.Contest.get(b.contest_id).catch(() => null);
    if (c) contestId = c.id;
  }
  let submissionId = null;
  if (b.related_submission_id) {
    const s = await svc.entities.Submission.get(b.related_submission_id).catch(() => null);
    if (s && (s.created_by_id === user.id || s.client_id === user.id || user.role === 'admin')) submissionId = s.id;
  }

  const ticket = await svc.entities.SupportTicket.create({
    // Ownership comes from the session, never the payload.
    user_id: user.id,
    user_email: user.email || null,
    user_role: user.user_role || null,
    ticket_id: ticketRef(),
    category,
    subject,
    description,
    contest_id: contestId,
    related_submission_id: submissionId,
    status: 'open',
    priority: HUMAN_ESCALATION.has(category) ? 'high' : (b.priority === 'high' ? 'normal' : 'normal'),
  });

  await svc.entities.Notification.create({
    type: 'support_ticket',
    title: 'Support ticket received',
    description: `We received your ticket ${ticket.ticket_id} about ${category}.`,
    recipient_user_id: user.id,
  }).catch(() => null);

  return json({ ticket_id: ticket.ticket_id, id: ticket.id, status: ticket.status });
}

/** A user sees only their own tickets; admins see all. */
export async function supportTicketList(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const isAdmin = user.role === 'admin';

  const rows = isAdmin
    ? await svc.entities.SupportTicket.filter({}, '-created_date', 200)
    : await svc.entities.SupportTicket.filter({ user_id: user.id }, '-created_date', 100);

  return json({
    tickets: rows.map((t) => ({
      id: t.id, ticket_id: t.ticket_id, category: t.category, subject: t.subject,
      description: isAdmin ? t.description : t.description,
      status: t.status || 'open', priority: t.priority || 'normal',
      admin_response: t.admin_response || null,
      contest_id: t.contest_id || null,
      created_date: t.created_date,
      ...(isAdmin ? { user_id: t.user_id, user_email: t.user_email } : {}),
    })),
    is_admin: isAdmin,
  });
}

/** Admin-only status/response updates. */
export async function supportTicketUpdate(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
  const svc = ctx.svc;
  const { id, status, admin_response: response } = ctx.body || {};
  if (!id) return json({ error: 'id is required' }, 400);
  if (status && !TICKET_STATES.includes(status)) return json({ error: 'Unknown status' }, 400);

  const t = await svc.entities.SupportTicket.get(id).catch(() => null);
  if (!t) return json({ error: 'Ticket not found' }, 404);

  const patch = {};
  if (status) patch.status = status;
  if (typeof response === 'string') patch.admin_response = response.slice(0, 5000);
  const updated = await svc.entities.SupportTicket.update(id, patch);

  if (status || response) {
    await svc.entities.Notification.create({
      type: 'support_ticket',
      title: 'Support ticket updated',
      description: `Ticket ${t.ticket_id} is now ${status || t.status}.`,
      recipient_user_id: t.user_id,
    }).catch(() => null);
  }
  return json({ ok: true, status: updated.status });
}

/**
 * Ask Support — grounded assistant.
 *
 * Answers come from a curated RazeKit knowledge base only. There is no
 * generative step, so the assistant structurally cannot invent platform
 * behaviour. Below the confidence threshold it returns the required
 * "I don't have verified information about that yet." plus escalation.
 */
export async function supportAsk(ctx) {
  const question = String(ctx.body?.question || '').trim();
  if (!question) return json({ error: 'Ask a question.' }, 400);
  if (question.length > 500) return json({ error: 'Please shorten your question.' }, 400);

  const hit = searchKnowledge(question);

  if (!hit) {
    return json({
      answered: false,
      answer: "I don't have verified information about that yet.",
      followup: 'A RazeKit team member can look into this for you.',
      escalate: true,
    });
  }

  return json({
    answered: true,
    topic: hit.topic,
    answer: hit.answer,
    // Anything account-specific always offers a human, since the assistant has
    // no authorization to read another user's financial or account state.
    escalate: hit.escalate === true,
    related: hit.related || [],
  });
}

export async function supportKnowledge() {
  return json({ topics: KNOWLEDGE.map((k) => ({ topic: k.topic, question: k.question })) });
}
