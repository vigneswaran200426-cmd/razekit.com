// @ts-nocheck
// Submission compliance evaluation + human review (spec 8/9/10).
//
// The agent gathers evidence; the deterministic engine decides. A client can
// never post a PASS, and a creator can never evaluate their own submission.
import { json } from './context.js';
import { evaluateCompliance, rollUp, ENGINE_VERSION, ELIGIBILITY, FINDING } from '../compliance/engine.js';
import { runAgent, contentHash } from '../agents/runner.js';

export const COMPLIANCE_AGENT = 'submission_compliance_agent';
const AGENT_VERSION = '1.0.0';

/** Load the locked criteria version + its criteria for a contest. */
export async function loadLockedCriteria(svc, contestId) {
  const versions = await svc.entities.ContestCriteriaVersion
    .filter({ contest_id: contestId }, '-created_date', 20).catch(() => []);
  const active = versions.find((v) => v.status === 'locked') || null;
  if (!active) return { version: null, criteria: [] };
  const criteria = await svc.entities.ContestCriterion
    .filter({ criteria_version_id: active.id }, 'position', 200).catch(() => []);
  return {
    version: active,
    criteria: criteria.map((c) => ({
      ...c,
      params: safeJson(c.params),
      mandatory: Boolean(c.mandatory),
    })),
  };
}

/**
 * Evaluate one submission. Idempotent: re-running with the same submission
 * content and the same criteria version returns the cached result (spec 24).
 */
export async function complianceEvaluate(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const submissionId = ctx.body?.submission_id;
  if (!submissionId) return json({ error: 'submission_id is required' }, 400);

  const submission = await svc.entities.Submission.get(submissionId).catch(() => null);
  if (!submission) return json({ error: 'Submission not found' }, 404);

  const contest = await svc.entities.Contest.get(submission.contest_id).catch(() => null);
  if (!contest) return json({ error: 'Contest not found' }, 404);

  // Creator (own submission), the contest owner, or an admin may trigger it.
  const allowed = submission.created_by_id === user.id
    || contest.created_by_id === user.id
    || user.role === 'admin';
  if (!allowed) return json({ error: 'Forbidden' }, 403);

  const { version, criteria } = await loadLockedCriteria(svc, contest.id);
  if (!version) {
    return json({
      status: ELIGIBILITY.PENDING,
      message: 'This contest has no confirmed requirements yet, so submissions cannot be evaluated.',
    });
  }

  const hash = contentHash(
    submission.id, submission.updated_date, submission.caption, submission.description,
    submission.live_url, submission.duration, submission.platform, submission.final_asset_uri,
    version.criteria_hash
  );

  // Cache: same submission content + same criteria version => same answer.
  const prior = await svc.entities.SubmissionCompliance
    .filter({ submission_id: submissionId }, '-created_date', 5).catch(() => []);
  const cached = prior.find((p) => p.content_hash === hash && p.criteria_version_id === version.id);
  if (cached && ctx.body?.force !== true) {
    const findings = await svc.entities.SubmissionComplianceFinding
      .filter({ compliance_id: cached.id }, '-created_date', 200).catch(() => []);
    return json({ ...publicCompliance(cached), findings: findings.map(publicFinding), cached: true });
  }

  // The agent supplies evidence for MANUAL criteria only; the engine decides.
  // With no LLM provider this returns nothing and everything manual becomes
  // REVIEW_REQUIRED — never an automatic pass (spec 23).
  let agentFindings = {};
  let agentRunId = null;
  const manual = criteria.filter((c) => c.evaluability !== 'auto');
  if (manual.length) {
    const run = await runAgent(svc, {
      agentName: COMPLIANCE_AGENT,
      agentVersion: AGENT_VERSION,
      contestId: contest.id,
      submissionId,
      triggeredBy: user.id,
      inputRef: hash,
      // Deliberately conservative: RazeKit cannot watch video, so we do not
      // pretend to. Manual criteria route to human review.
      execute: async () => ({ findings: {}, note: 'Media-based criteria require human review.' }),
    });
    agentRunId = run.agentRowId;
    if (run.ok) agentFindings = run.result?.findings || {};
  }

  const evaluated = evaluateCompliance({
    criteria,
    submission,
    ctx: { contest },
    agentFindings,
  });

  const now = new Date().toISOString();
  const record = await svc.entities.SubmissionCompliance.create({
    submission_id: submissionId,
    contest_id: contest.id,
    creator_id: submission.created_by_id,
    client_id: contest.created_by_id,
    criteria_version_id: version.id,
    status: evaluated.status,
    engine_version: ENGINE_VERSION,
    agent_run_id: agentRunId,
    content_hash: hash,
    evaluated_at: now,
    mandatory_failed: evaluated.mandatory_failed,
    review_required: evaluated.review_required,
    passed: evaluated.passed,
    not_evaluable: evaluated.not_evaluable,
    reason: evaluated.reason,
  });

  for (const f of evaluated.findings) {
    await svc.entities.SubmissionComplianceFinding.create({
      compliance_id: record.id,
      submission_id: submissionId,
      contest_id: contest.id,
      criterion_id: f.criterion_id,
      criterion_key: f.criterion_key,
      criterion_label: f.criterion_label,
      mandatory: f.mandatory,
      status: f.status,
      evidence: f.evidence,
      confidence: f.confidence,
      evaluator: f.evaluator,
      evaluated_at: now,
    }).catch(() => null);
  }

  return json({ ...publicCompliance(record), findings: evaluated.findings, cached: false });
}

/** Compliance for a submission, scoped to people entitled to see it. */
export async function complianceGet(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const submissionId = ctx.body?.submission_id;
  if (!submissionId) return json({ error: 'submission_id is required' }, 400);

  const submission = await svc.entities.Submission.get(submissionId).catch(() => null);
  if (!submission) return json({ error: 'Submission not found' }, 404);
  const contest = await svc.entities.Contest.get(submission.contest_id).catch(() => null);

  const allowed = submission.created_by_id === user.id
    || (contest && contest.created_by_id === user.id)
    || user.role === 'admin';
  if (!allowed) return json({ error: 'Forbidden' }, 403);

  const rows = await svc.entities.SubmissionCompliance
    .filter({ submission_id: submissionId }, '-created_date', 5).catch(() => []);
  if (!rows.length) return json({ status: ELIGIBILITY.PENDING, findings: [] });

  const latest = rows[0];
  const findings = await svc.entities.SubmissionComplianceFinding
    .filter({ compliance_id: latest.id }, '-created_date', 200).catch(() => []);
  return json({ ...publicCompliance(latest), findings: findings.map(publicFinding) });
}

/**
 * Human decision on a finding (spec 10).
 * Authorized reviewers only, a reason is required, and the original agent
 * assessment is preserved rather than overwritten.
 */
export async function complianceReview(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const { finding_id: findingId, action, reason } = ctx.body || {};

  if (!findingId || !action) return json({ error: 'finding_id and action are required' }, 400);
  const VALID = ['confirm_pass', 'confirm_fail', 'request_review'];
  if (!VALID.includes(action)) return json({ error: `action must be one of: ${VALID.join(', ')}` }, 400);
  if (!reason || String(reason).trim().length < 5) {
    return json({ error: 'A reason is required for every review decision.' }, 400);
  }

  const finding = await svc.entities.SubmissionComplianceFinding.get(findingId).catch(() => null);
  if (!finding) return json({ error: 'Finding not found' }, 404);

  const contest = await svc.entities.Contest.get(finding.contest_id).catch(() => null);
  // Only an admin, or the brand that owns the contest, may review.
  const isAdmin = user.role === 'admin';
  const isOwner = contest && contest.created_by_id === user.id;
  if (!isAdmin && !isOwner) return json({ error: 'Forbidden' }, 403);

  const next = action === 'confirm_pass' ? FINDING.PASS
    : action === 'confirm_fail' ? FINDING.FAIL
    : FINDING.REVIEW_REQUIRED;

  const previous = finding.status;
  await svc.entities.SubmissionComplianceFinding.update(findingId, {
    status: next,
    overridden: true,
    overridden_by: user.id,
    override_reason: String(reason).slice(0, 500),
  });

  await svc.entities.ComplianceReview.create({
    compliance_id: finding.compliance_id,
    finding_id: findingId,
    submission_id: finding.submission_id,
    contest_id: finding.contest_id,
    reviewer_id: user.id,
    reviewer_role: isAdmin ? 'admin' : 'client',
    action,
    reason: String(reason).slice(0, 500),
    previous_status: previous,
    new_status: next,
    // The machine's original view is retained for audit.
    agent_status_at_review: finding.evaluator || null,
    created_at: new Date().toISOString(),
  }).catch(() => null);

  // Recompute overall eligibility from the full finding set.
  const all = await svc.entities.SubmissionComplianceFinding
    .filter({ compliance_id: finding.compliance_id }, '-created_date', 200).catch(() => []);
  const rolled = rollUp(all.map((f) => ({ mandatory: Boolean(f.mandatory), status: f.status })));
  await svc.entities.SubmissionCompliance.update(finding.compliance_id, {
    status: rolled.status,
    mandatory_failed: rolled.mandatory_failed,
    review_required: rolled.review_required,
    passed: rolled.passed,
    reason: rolled.reason,
  }).catch(() => {});

  await svc.entities.AuditLog.create({
    user_id: finding.submission_id, action: 'compliance.review', actor: user.id, status: 'success',
    reason: action,
    result: JSON.stringify({
      finding_id: findingId, criterion: finding.criterion_key,
      previous, next, eligibility: rolled.status, reviewer_role: isAdmin ? 'admin' : 'client',
    }),
  }).catch(() => null);

  return json({ ok: true, finding_status: next, eligibility: rolled.status });
}

const publicCompliance = (r) => ({
  compliance_id: r.id,
  submission_id: r.submission_id,
  contest_id: r.contest_id,
  status: r.status,
  reason: r.reason,
  mandatory_failed: r.mandatory_failed,
  review_required: r.review_required,
  passed: r.passed,
  evaluated_at: r.evaluated_at,
  engine_version: r.engine_version,
  criteria_version_id: r.criteria_version_id,
});

const publicFinding = (f) => ({
  id: f.id,
  criterion_key: f.criterion_key,
  criterion_label: f.criterion_label,
  mandatory: Boolean(f.mandatory),
  status: f.status,
  evidence: f.evidence,
  evaluator: f.evaluator,
  overridden: Boolean(f.overridden),
});

function safeJson(s) {
  if (!s) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return {}; }
}
