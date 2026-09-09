// @ts-nocheck
// Contest criteria lifecycle (spec 1-6).
//
// Flow: recommend -> client edits -> client confirms -> version LOCKED.
// Prize/payment setup stays blocked until a confirmed version exists (spec 5),
// and a locked version never mutates once creators can participate (spec 6).
import { json } from './context.js';
import { criteriaHash, customCriterion, criterionDefinition } from '../criteria/library.js';
import { recommendCriteria, AGENT_NAME, AGENT_VERSION } from '../criteria/agent.js';
import { runAgent, ask, fence, contentHash } from '../agents/runner.js';
import { CRITERIA_LIBRARY } from '../criteria/library.js';

const ownsContest = (contest, user) => contest && (contest.created_by_id === user.id || user.role === 'admin');

/** The criteria catalog, for the client-side picker. */
export async function criteriaLibrary(ctx) {
  if (!ctx.user) return json({ error: 'Unauthorized' }, 401);
  return json({
    library: CRITERIA_LIBRARY.map((c) => ({
      key: c.key, category: c.category, label: c.label,
      description: c.description, evaluability: c.evaluability,
    })),
  });
}

/** STEP 2 — analyse the brief and recommend criteria. Recommends only. */
export async function criteriaRecommend(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const contestId = ctx.body?.contest_id;
  if (!contestId) return json({ error: 'contest_id is required' }, 400);

  const contest = await svc.entities.Contest.get(contestId).catch(() => null);
  if (!contest) return json({ error: 'Contest not found' }, 404);
  if (!ownsContest(contest, user)) return json({ error: 'Forbidden' }, 403);

  const run = await runAgent(svc, {
    agentName: AGENT_NAME,
    agentVersion: AGENT_VERSION,
    contestId,
    triggeredBy: user.id,
    inputRef: contentHash(contest.title, contest.description, contest.contest_rules),
    execute: (helpers) => recommendCriteria({ contest, helpers: { ...helpers, ask, fence } }),
  });

  if (!run.ok) {
    // Agent trouble must never block contest creation — the client can still
    // choose criteria manually from the library.
    return json({
      recommendations: [], notes: [],
      agent_status: run.unavailable ? 'agent_unavailable' : 'failed',
      message: 'Automatic analysis is unavailable right now. You can still choose requirements yourself.',
      run_id: run.runId,
    });
  }

  return json({
    recommendations: run.result.recommendations,
    notes: run.result.notes,
    provider: run.result.provider,
    agent_status: 'succeeded',
    run_id: run.runId,
    agent_run_id: run.agentRowId,
  });
}

/**
 * STEP 4/7 — confirm the selection and LOCK it.
 * Everything the client sends is treated as a selection, never as authority:
 * criterion definitions come from the server-side library, not the payload.
 */
export async function criteriaConfirm(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const b = ctx.body || {};
  const contestId = b.contest_id;
  if (!contestId) return json({ error: 'contest_id is required' }, 400);
  if (b.confirmed !== true) {
    return json({ error: 'You must confirm that these requirements are accurate and mandatory.' }, 400);
  }

  const contest = await svc.entities.Contest.get(contestId).catch(() => null);
  if (!contest) return json({ error: 'Contest not found' }, 404);
  if (!ownsContest(contest, user)) return json({ error: 'Forbidden' }, 403);

  // Existing versions: a locked one cannot be silently replaced (spec 6).
  const existing = await svc.entities.ContestCriteriaVersion
    .filter({ contest_id: contestId }, '-created_date', 20).catch(() => []);
  const locked = existing.find((v) => v.status === 'locked');
  if (locked && !b.supersede) {
    return json({
      error: {
        code: 'CRITERIA_LOCKED',
        message: 'These contest requirements are locked because the contest is live. Creating a new version requires an authorized change.',
      },
    }, 409);
  }
  // Superseding is an admin action, and it creates a NEW version rather than
  // mutating history.
  if (locked && b.supersede && user.role !== 'admin') {
    return json({ error: 'Only an administrator can revise locked contest requirements.' }, 403);
  }

  // Build criteria from the SERVER library. A client cannot invent an evaluator.
  const selected = Array.isArray(b.criteria) ? b.criteria : [];
  const built = [];
  for (const [i, sel] of selected.entries()) {
    const def = criterionDefinition(sel?.key);
    if (!def) continue; // unknown key -> ignored, never trusted
    built.push({
      key: def.key,
      category: def.category,
      label: def.label,
      description: def.description,
      evaluability: def.evaluability,
      evaluator: def.evaluator || null,
      // Only params the definition declares; values are client-supplied config.
      params: sanitizeParams(def, sel?.params),
      mandatory: sel?.mandatory === true,
      source: sel?.source === 'custom' ? 'custom' : 'recommended',
      rationale: typeof sel?.rationale === 'string' ? sel.rationale.slice(0, 400) : null,
      position: i,
    });
  }

  // Custom client instructions (spec 4) — always manual, never machine-checked.
  const customs = Array.isArray(b.custom_instructions) ? b.custom_instructions : [];
  customs.slice(0, 25).forEach((c, i) => {
    const text = typeof c === 'string' ? c : c?.text;
    if (!text || !String(text).trim()) return;
    const def = customCriterion(String(text).trim(), built.length);
    built.push({
      ...def,
      evaluator: null,
      params: {},
      mandatory: (typeof c === 'object' && c?.mandatory === true) || false,
      rationale: 'Added by the brand as a contest-specific instruction.',
      position: built.length,
    });
  });

  if (!built.length) return json({ error: 'Select at least one requirement.' }, 400);

  const version = (existing.reduce((m, v) => Math.max(m, Number(v.version) || 0), 0) || 0) + 1;
  const hash = criteriaHash(built);
  const now = new Date().toISOString();

  const versionRow = await svc.entities.ContestCriteriaVersion.create({
    contest_id: contestId,
    client_id: contest.created_by_id,
    version,
    // Confirmed, and locked immediately: these are the rules creators see.
    status: 'locked',
    criteria_hash: hash,
    confirmed_by: user.id,
    confirmed_at: now,
    locked_at: now,
    mandatory_count: built.filter((c) => c.mandatory).length,
    collaboration_required: Boolean(b.collaboration_required),
    handover_required: Boolean(b.handover_required),
    handover_config: b.handover_config ? JSON.stringify(b.handover_config).slice(0, 4000) : null,
    collaboration_config: b.collaboration_config ? JSON.stringify(b.collaboration_config).slice(0, 4000) : null,
    source_agent_run_id: b.agent_run_id || null,
  });

  for (const c of built) {
    await svc.entities.ContestCriterion.create({
      ...c,
      params: JSON.stringify(c.params || {}),
      criteria_version_id: versionRow.id,
      contest_id: contestId,
      status: 'active',
    }).catch(() => null);
  }

  // Supersede the previous version instead of deleting it (spec 6).
  for (const v of existing) {
    if (v.status !== 'superseded') {
      await svc.entities.ContestCriteriaVersion.update(v.id, { status: 'superseded', superseded_by: versionRow.id }).catch(() => {});
    }
  }

  // This is what unlocks prize/payment setup (spec 5).
  await svc.entities.Contest.update(contestId, {
    criteria_version_id: versionRow.id,
    criteria_confirmed_at: now,
    handover_required: Boolean(b.handover_required),
  }).catch(() => {});

  await svc.entities.AuditLog.create({
    user_id: user.id, action: 'contest.criteria.confirm', actor: user.id, status: 'success',
    reason: locked ? 'superseded' : 'initial',
    result: JSON.stringify({ contest_id: contestId, criteria_version_id: versionRow.id, version, criteria_hash: hash, mandatory: versionRow.mandatory_count }),
  }).catch(() => null);

  await svc.entities.Notification.create({
    type: 'contest_criteria_confirmed',
    title: 'Contest requirements confirmed',
    description: `${versionRow.mandatory_count} mandatory requirement(s) are now official for "${contest.title}".`,
    recipient_user_id: contest.created_by_id, contest_id: contestId,
  }).catch(() => null);

  return json({
    criteria_version_id: versionRow.id, version, criteria_hash: hash,
    mandatory_count: versionRow.mandatory_count, locked: true,
    payment_unlocked: true,
  });
}

/**
 * The locked rules for a contest. Readable by anyone who can see the contest —
 * creators MUST be able to read the rules they are judged against (spec 17).
 */
export async function criteriaGet(ctx) {
  const svc = ctx.svc;
  const contestId = ctx.body?.contest_id;
  if (!contestId) return json({ error: 'contest_id is required' }, 400);

  const versions = await svc.entities.ContestCriteriaVersion
    .filter({ contest_id: contestId }, '-created_date', 20).catch(() => []);
  const active = versions.find((v) => v.status === 'locked') || versions[0];
  if (!active) return json({ criteria_version: null, criteria: [], confirmed: false });

  const criteria = await svc.entities.ContestCriterion
    .filter({ criteria_version_id: active.id }, 'position', 200).catch(() => []);

  return json({
    confirmed: true,
    criteria_version: {
      id: active.id, version: active.version, status: active.status,
      criteria_hash: active.criteria_hash, confirmed_at: active.confirmed_at,
      mandatory_count: active.mandatory_count,
      collaboration_required: Boolean(active.collaboration_required),
      handover_required: Boolean(active.handover_required),
    },
    criteria: criteria
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((c) => ({
        id: c.id, key: c.key, category: c.category, label: c.label,
        description: c.description, mandatory: Boolean(c.mandatory),
        evaluability: c.evaluability, rationale: c.rationale, source: c.source,
      })),
  });
}

/** Only definition-declared params are accepted, coerced to safe shapes. */
function sanitizeParams(def, supplied) {
  const allowed = def.params ? Object.keys(def.params) : [];
  const out = {};
  for (const k of allowed) {
    const v = supplied?.[k];
    if (v === undefined || v === null) { out[k] = def.params[k]; continue; }
    if (Array.isArray(v)) out[k] = v.slice(0, 30).map((x) => String(x).slice(0, 80));
    else if (typeof v === 'number') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
  }
  return out;
}
