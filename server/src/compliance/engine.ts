// @ts-nocheck
// Deterministic Compliance Engine (spec 9).
//
// THE authority on eligibility. An agent produces findings and evidence; this
// module decides. Nothing here calls an LLM, and no frontend value reaches it.
//
// The rule that matters: uncertainty NEVER becomes a pass. A mandatory
// criterion that could not be evaluated blocks eligibility until a human
// decides (spec 23: an unavailable agent must not create a false PASS).
import { criterionDefinition, EVALUABILITY } from '../criteria/library.js';

export const ENGINE_VERSION = 'rk-compliance-1.0.0';

export const FINDING = {
  PASS: 'pass',
  FAIL: 'fail',
  REVIEW_REQUIRED: 'review_required',
  NOT_EVALUABLE: 'not_evaluable',
};

export const ELIGIBILITY = {
  ELIGIBLE: 'eligible',
  INELIGIBLE: 'ineligible',
  REVIEW_REQUIRED: 'review_required',
  PENDING: 'pending',
};

const norm = (v) => String(v ?? '').toLowerCase().trim();
const asList = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(norm).filter(Boolean);

function textOf(submission, fields) {
  return (fields || ['caption', 'description', 'title'])
    .map((f) => submission?.[f])
    .filter((v) => typeof v === 'string')
    .join(' \n ')
    .toLowerCase();
}

/**
 * Deterministic evaluators. Each returns { status, evidence }.
 *
 * They read ONLY stored structured data — never the creator's free text as an
 * instruction. Creator text is compared as data, never interpreted.
 */
const EVALUATORS = {
  duration(sub, params) {
    const d = Number(sub?.duration);
    if (!Number.isFinite(d) || d <= 0) {
      return { status: FINDING.NOT_EVALUABLE, evidence: 'No duration was recorded for this submission.' };
    }
    const min = Number(params?.min_seconds);
    const max = Number(params?.max_seconds);
    if (Number.isFinite(min) && d < min) return { status: FINDING.FAIL, evidence: `Duration is ${d}s, below the required minimum of ${min}s.` };
    if (Number.isFinite(max) && d > max) return { status: FINDING.FAIL, evidence: `Duration is ${d}s, above the required maximum of ${max}s.` };
    return { status: FINDING.PASS, evidence: `Duration is ${d}s, inside the required range.` };
  },

  contentType(sub, params) {
    const want = norm(params?.content_type);
    if (!want) return { status: FINDING.NOT_EVALUABLE, evidence: 'No required content format was configured.' };
    const got = norm(sub?.content_type || sub?.media_kind);
    if (!got) return { status: FINDING.NOT_EVALUABLE, evidence: 'The submission did not record a content format.' };
    return got === want
      ? { status: FINDING.PASS, evidence: `Content format is "${got}".` }
      : { status: FINDING.FAIL, evidence: `Content format is "${got}", but "${want}" is required.` };
  },

  platform(sub, params) {
    const want = asList(params?.platforms);
    if (!want.length) return { status: FINDING.NOT_EVALUABLE, evidence: 'No required platform was configured.' };
    const got = norm(sub?.platform);
    if (!got) return { status: FINDING.NOT_EVALUABLE, evidence: 'The submission did not record a platform.' };
    return want.includes(got)
      ? { status: FINDING.PASS, evidence: `Published on ${sub.platform}.` }
      : { status: FINDING.FAIL, evidence: `Published on ${sub.platform}, but ${want.join(' or ')} is required.` };
  },

  published(sub) {
    const url = String(sub?.live_url || '').trim();
    if (!url) return { status: FINDING.FAIL, evidence: 'No public live URL was provided.' };
    if (!/^https?:\/\//i.test(url)) return { status: FINDING.FAIL, evidence: 'The provided link is not a valid public URL.' };
    return { status: FINDING.PASS, evidence: 'A public live URL was provided.' };
  },

  captionPresent(sub) {
    const c = String(sub?.caption || '').trim();
    return c
      ? { status: FINDING.PASS, evidence: 'A caption was supplied.' }
      : { status: FINDING.FAIL, evidence: 'No caption was supplied.' };
  },

  hashtags(sub, params) {
    const want = asList(params?.tags).map((t) => (t.startsWith('#') ? t : `#${t}`));
    if (!want.length) return { status: FINDING.NOT_EVALUABLE, evidence: 'No required hashtags were configured.' };
    const hay = `${textOf(sub, ['caption', 'description'])} ${asList(sub?.hashtags).join(' ')}`;
    const missing = want.filter((t) => !hay.includes(t));
    return missing.length
      ? { status: FINDING.FAIL, evidence: `Missing required hashtag(s): ${missing.join(', ')}.` }
      : { status: FINDING.PASS, evidence: 'All required hashtags are present.' };
  },

  mentions(sub, params) {
    const want = asList(params?.handles).map((h) => (h.startsWith('@') ? h : `@${h}`));
    if (!want.length) return { status: FINDING.NOT_EVALUABLE, evidence: 'No required mention was configured.' };
    const hay = `${textOf(sub, ['caption', 'description'])} ${asList(sub?.mentions).join(' ')}`;
    const missing = want.filter((h) => !hay.includes(h));
    return missing.length
      ? { status: FINDING.FAIL, evidence: `Missing required mention(s): ${missing.join(', ')}.` }
      : { status: FINDING.PASS, evidence: 'Required mention is present.' };
  },

  textContains(sub, params) {
    const phrases = asList(params?.phrases);
    if (!phrases.length) {
      // e.g. the CTA is a visual end-card we cannot read — say so honestly.
      return { status: FINDING.NOT_EVALUABLE, evidence: 'No checkable wording was configured, so this needs a human review.' };
    }
    const hay = textOf(sub, params?.fields);
    if (!hay.trim()) return { status: FINDING.NOT_EVALUABLE, evidence: 'The submission contains no text to check.' };
    const found = phrases.some((p) => hay.includes(p));
    return found
      ? { status: FINDING.PASS, evidence: 'Required wording was found in the submission text.' }
      : { status: FINDING.FAIL, evidence: 'Required wording was not found in the submission text.' };
  },

  textExcludes(sub, params) {
    const phrases = asList(params?.phrases);
    if (!phrases.length) return { status: FINDING.NOT_EVALUABLE, evidence: 'No prohibited wording was configured.' };
    const hay = textOf(sub, params?.fields);
    const hit = phrases.filter((p) => hay.includes(p));
    return hit.length
      ? { status: FINDING.FAIL, evidence: 'Prohibited wording was found in the submission text.' }
      : { status: FINDING.PASS, evidence: 'No prohibited wording was found.' };
  },

  deadline(sub, _params, ctx) {
    const deadline = Date.parse(ctx?.contest?.deadline || '');
    const at = Date.parse(sub?.submitted_at || sub?.created_date || '');
    if (!Number.isFinite(deadline) || !Number.isFinite(at)) {
      return { status: FINDING.NOT_EVALUABLE, evidence: 'Submission or deadline time is missing.' };
    }
    return at <= deadline
      ? { status: FINDING.PASS, evidence: 'Submitted before the deadline.' }
      : { status: FINDING.FAIL, evidence: 'Submitted after the contest deadline.' };
  },

  aspectRatio(sub, params) {
    const want = asList(params?.ratios);
    const got = norm(sub?.resolution || sub?.aspect_ratio);
    if (!want.length) return { status: FINDING.NOT_EVALUABLE, evidence: 'No required aspect ratio was configured.' };
    if (!got) return { status: FINDING.NOT_EVALUABLE, evidence: 'The submission did not record an aspect ratio.' };
    return want.some((w) => got.includes(w))
      ? { status: FINDING.PASS, evidence: `Aspect ratio "${got}" matches the requirement.` }
      : { status: FINDING.FAIL, evidence: `Aspect ratio "${got}" does not match ${want.join(' or ')}.` };
  },

  resolution(sub, params) {
    const min = Number(params?.min_height);
    const raw = String(sub?.resolution || '');
    const m = /(\d{3,5})\s*[x×]\s*(\d{3,5})/i.exec(raw);
    if (!Number.isFinite(min)) return { status: FINDING.NOT_EVALUABLE, evidence: 'No minimum resolution was configured.' };
    if (!m) return { status: FINDING.NOT_EVALUABLE, evidence: 'The submission did not record a readable resolution.' };
    const h = Math.max(Number(m[1]), Number(m[2]));
    return h >= min
      ? { status: FINDING.PASS, evidence: `Resolution ${raw} meets the ${min}p minimum.` }
      : { status: FINDING.FAIL, evidence: `Resolution ${raw} is below the ${min}p minimum.` };
  },

  assetAttached(sub) {
    const has = Boolean(sub?.final_asset_uri || sub?.video_url || sub?.live_url);
    return has
      ? { status: FINDING.PASS, evidence: 'A final asset or live URL is attached.' }
      : { status: FINDING.FAIL, evidence: 'No final asset or live URL was attached.' };
  },

  handoverConfigured(_sub, _params, ctx) {
    // The rule is satisfied at finalization by the real Handover flow; at
    // submission time we only confirm the contest is configured for it.
    return ctx?.contest?.handover_required
      ? { status: FINDING.PASS, evidence: 'Contest is configured for account handover; completion is verified at handover.' }
      : { status: FINDING.NOT_EVALUABLE, evidence: 'Handover configuration could not be confirmed.' };
  },
};

/**
 * Evaluate one submission against a locked criteria set.
 *
 * @param criteria  ContestCriterion rows from the LOCKED version
 * @param submission the submission record
 * @param ctx        { contest }
 * @param agentFindings optional map key -> { status, evidence, confidence } from
 *                      the Submission Compliance Agent. ADVISORY ONLY: an agent
 *                      may never upgrade a criterion to PASS on its own.
 */
export function evaluateCompliance({ criteria, submission, ctx = {}, agentFindings = {} }) {
  const findings = [];

  for (const c of criteria || []) {
    const def = criterionDefinition(c.key) || {};
    const evaluatorName = c.evaluator || def.evaluator;
    const evaluability = c.evaluability || def.evaluability || EVALUABILITY.MANUAL;
    const params = c.params && typeof c.params === 'string' ? safeJson(c.params) : (c.params || def.params || {});

    let result;
    if (evaluability === EVALUABILITY.AUTO && EVALUATORS[evaluatorName]) {
      result = EVALUATORS[evaluatorName](submission, params, ctx);
      result.evaluator = `engine:${evaluatorName}`;
    } else {
      // Manual criterion. An agent may supply evidence, but only to escalate —
      // never to auto-pass a mandatory rule.
      const a = agentFindings[c.key];
      if (a && a.status === FINDING.FAIL) {
        result = { status: FINDING.FAIL, evidence: a.evidence || 'Agent assessed this requirement as not met.', evaluator: 'agent', confidence: a.confidence };
      } else if (a && a.status === FINDING.PASS && !c.mandatory) {
        // Non-mandatory: an agent PASS is acceptable.
        result = { status: FINDING.PASS, evidence: a.evidence || 'Agent assessed this requirement as met.', evaluator: 'agent', confidence: a.confidence };
      } else {
        result = {
          status: FINDING.REVIEW_REQUIRED,
          evidence: a?.evidence || 'This requirement needs a human review.',
          evaluator: 'manual',
          confidence: a?.confidence,
        };
      }
    }

    findings.push({
      criterion_key: c.key,
      criterion_label: c.label || def.label || c.key,
      criterion_id: c.id || null,
      mandatory: Boolean(c.mandatory),
      status: result.status,
      evidence: result.evidence,
      evaluator: result.evaluator,
      confidence: result.confidence ?? null,
    });
  }

  return { findings, ...rollUp(findings) };
}

/** Decide overall eligibility from findings. Uncertainty never passes. */
export function rollUp(findings) {
  const mandatory = (findings || []).filter((f) => f.mandatory);

  const mandatoryFailed = mandatory.filter((f) => f.status === FINDING.FAIL).length;
  const mandatoryUnresolved = mandatory.filter(
    (f) => f.status === FINDING.REVIEW_REQUIRED || f.status === FINDING.NOT_EVALUABLE
  ).length;
  const passed = (findings || []).filter((f) => f.status === FINDING.PASS).length;
  const notEvaluable = (findings || []).filter((f) => f.status === FINDING.NOT_EVALUABLE).length;

  let status;
  let reason;
  if (mandatoryFailed > 0) {
    status = ELIGIBILITY.INELIGIBLE;
    reason = `${mandatoryFailed} mandatory requirement${mandatoryFailed === 1 ? '' : 's'} not met.`;
  } else if (mandatoryUnresolved > 0) {
    status = ELIGIBILITY.REVIEW_REQUIRED;
    reason = `${mandatoryUnresolved} mandatory requirement${mandatoryUnresolved === 1 ? '' : 's'} need human review.`;
  } else {
    status = ELIGIBILITY.ELIGIBLE;
    reason = 'All mandatory requirements are met.';
  }

  return {
    status,
    reason,
    mandatory_failed: mandatoryFailed,
    review_required: mandatoryUnresolved,
    passed,
    not_evaluable: notEvaluable,
    engine_version: ENGINE_VERSION,
  };
}

/** Only ELIGIBLE submissions may enter winner scoring (spec 11/28). */
export function isEligible(status) {
  return status === ELIGIBILITY.ELIGIBLE;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
