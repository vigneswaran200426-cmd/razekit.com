// @ts-nocheck
// CONTEST CRITERIA AGENT (spec 7).
//
// Reads a contest brief and RECOMMENDS structured criteria. The client decides;
// nothing here becomes mandatory on its own (spec 1: "The agent recommends. The
// CLIENT decides.").
//
// It runs deterministically from the brief by default, and uses the LLM only to
// enrich wording/rationale when a provider is configured. That ordering matters:
// with no API key the feature still works and never fabricates requirements.
import { CRITERIA_LIBRARY, criterionDefinition, EVALUABILITY } from './library.js';
import { fence, ask, llmAvailable } from '../agents/runner.js';

export const AGENT_NAME = 'contest_criteria_agent';
export const AGENT_VERSION = '1.0.0';

// Structured statuses required by spec 7.
export const REC_STATUS = {
  RECOMMENDED: 'RECOMMENDED',
  OPTIONAL: 'OPTIONAL',
  AMBIGUOUS: 'AMBIGUOUS',
  UNVERIFIABLE: 'UNVERIFIABLE',
  CONFLICTING: 'CONFLICTING',
};

const has = (text, ...words) => words.some((w) => text.includes(w));

/**
 * Deterministic brief analysis. Every recommendation traces to wording actually
 * present in the brief, so nothing is invented about the brand.
 */
export function analyseBrief(contest) {
  const brief = [
    contest?.title, contest?.short_description, contest?.description,
    contest?.brief, contest?.contest_rules, contest?.additional_notes,
    contest?.custom_requirements,
  ].filter(Boolean).join('\n').toLowerCase();

  const recs = [];
  const notes = [];
  const seen = new Set();

  const add = (key, status, why, params) => {
    if (seen.has(key)) return;
    const def = criterionDefinition(key);
    if (!def) return;
    seen.add(key);
    recs.push({
      key, category: def.category, label: def.label, description: def.description,
      evaluability: def.evaluability, evaluator: def.evaluator || null,
      params: params || def.params || {},
      status,
      // Every recommendation explains itself (spec 7/16).
      rationale: why,
      mandatory: false,      // the client decides
      source: 'recommended',
    });
  };

  // Always-relevant delivery basics — these are checkable and uncontroversial.
  add('delivery.deadline', REC_STATUS.RECOMMENDED, 'Every contest has a deadline, and RazeKit can verify submission time automatically.');
  add('delivery.asset_attached', REC_STATUS.RECOMMENDED, 'A submission needs a final asset or live link before it can be judged.');

  // Platform — from the contest category or explicit wording.
  const cat = String(contest?.category || '').toLowerCase();
  const platform = has(brief, 'instagram') || cat.includes('instagram') ? 'instagram'
    : has(brief, 'youtube', 'shorts') || cat.includes('youtube') ? 'youtube'
    : has(brief, 'tiktok') ? 'tiktok' : null;
  if (platform) {
    add('publishing.platform', REC_STATUS.RECOMMENDED,
      `The brief and category point to ${platform}, and RazeKit can verify the published platform.`,
      { platforms: [platform] });
    add('publishing.published', REC_STATUS.RECOMMENDED, 'Brand Traffic is only measurable once the work is published with a public link.');
  }

  // Duration — parse a real range from the brief rather than assuming one.
  const range = /(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s*(?:second|sec|s)\b/.exec(brief);
  const single = /(\d{1,3})\s*(?:second|sec)\b/.exec(brief);
  if (range) {
    add('content.duration', REC_STATUS.RECOMMENDED,
      `The brief asks for ${range[1]}–${range[2]} seconds, which RazeKit can verify from the submission.`,
      { min_seconds: Number(range[1]), max_seconds: Number(range[2]) });
  } else if (single) {
    add('content.duration', REC_STATUS.AMBIGUOUS,
      `The brief mentions ${single[1]} seconds but not whether that is a minimum, maximum or target. Consider setting an explicit range.`,
      { min_seconds: null, max_seconds: Number(single[1]) });
    notes.push({ type: 'ambiguous', message: `"${single[1]} seconds" is not stated as a minimum or maximum.` });
  }

  if (has(brief, 'footage', 'supplied', 'provided asset', 'raw file', 'b-roll')) {
    add('content.supplied_footage', REC_STATUS.RECOMMENDED, 'The brief refers to supplied footage, so restricting creators to it keeps entries comparable.');
  }
  if (has(brief, 'product', 'showcase the product')) {
    add('content.product_visible', REC_STATUS.RECOMMENDED, 'The brief centres on the product, so its visibility is a fair requirement.');
  }
  if (has(brief, 'cta', 'call to action', 'link in bio', 'swipe up', 'shop now')) {
    add('content.cta', REC_STATUS.RECOMMENDED, 'The brief asks for a call to action. RazeKit can check written CTAs in the caption; an on-screen-only CTA needs human review.');
  }
  if (has(brief, 'caption')) add('publishing.caption', REC_STATUS.RECOMMENDED, 'The brief references a caption, which RazeKit can verify is present.');
  if (has(brief, 'hashtag', '#')) add('publishing.hashtags', REC_STATUS.RECOMMENDED, 'The brief references hashtags. Add the exact tags so RazeKit can verify them.', { tags: [] });
  if (has(brief, 'tag us', 'mention', '@')) add('publishing.mention', REC_STATUS.RECOMMENDED, 'The brief asks creators to tag the brand. Add the exact handle so RazeKit can verify it.', { handles: [] });
  if (has(brief, 'logo')) add('branding.logo', REC_STATUS.RECOMMENDED, 'The brief references logo usage.');
  if (has(brief, 'competitor', 'rival brand')) add('restrictions.no_competitors', REC_STATUS.RECOMMENDED, 'The brief mentions competitors, so excluding them protects the campaign.');
  if (has(brief, 'music', 'audio track', 'song')) add('restrictions.music', REC_STATUS.RECOMMENDED, 'The brief references audio, and music rights are a common contest dispute.');
  if (has(brief, 'vertical', '9:16', '16:9', 'aspect')) {
    const r = /(9:16|16:9|1:1|4:5)/.exec(brief);
    add('delivery.aspect_ratio', REC_STATUS.RECOMMENDED, 'The brief specifies a format, which RazeKit can verify.', { ratios: r ? [r[1]] : [] });
  }

  // Collaboration / handover — only when the brief actually implies it (spec 3).
  const wantsHandover = has(brief, 'handover', 'hand over', 'transfer the account', 'account ownership', 'give us the account');
  const wantsCollab = has(brief, 'collaborat', 'co-create', 'joint post', 'partner with', 'work with our team');
  if (wantsHandover) {
    add('handover.required', REC_STATUS.RECOMMENDED, 'The brief asks the creator to transfer the campaign account after completion, so RazeKit account handover applies.');
    add('handover.ownership_transfer', REC_STATUS.RECOMMENDED, 'Ownership transfer is stated in the brief.');
  }
  if (wantsCollab) {
    add('collaboration.required', REC_STATUS.RECOMMENDED, 'The brief describes working directly with the brand.');
  }

  // Contradictions and gaps worth telling the client about.
  if (/only supplied footage/i.test(brief) && /original footage|shoot your own|film your own/i.test(brief)) {
    notes.push({ type: 'conflict', message: 'The brief asks for supplied footage only AND original footage. Creators cannot satisfy both.' });
  }
  if (!platform) notes.push({ type: 'missing', message: 'No publishing platform is stated. Brand Traffic needs a published link to be measurable.' });
  if (!contest?.brand_destination_url) {
    notes.push({ type: 'missing', message: 'No campaign destination URL is set, so Brand Traffic cannot be measured for this contest.' });
  }

  // Mark honestly what RazeKit cannot machine-verify (spec 7: never claim
  // verification the system cannot perform).
  for (const r of recs) {
    if (r.evaluability === EVALUABILITY.MANUAL && r.status === REC_STATUS.RECOMMENDED) {
      r.status = REC_STATUS.UNVERIFIABLE;
      r.rationale += ' RazeKit cannot verify this automatically, so it will be sent for human review.';
    }
  }

  return { recommendations: recs, notes };
}

/**
 * Run the agent. Deterministic analysis is the source of truth; the LLM may
 * only improve rationale wording and surface extra ambiguity notes. It can
 * never add a criterion that is not in the library, and never sets `mandatory`.
 */
export async function recommendCriteria({ contest, helpers }) {
  const base = analyseBrief(contest);
  if (!llmAvailable()) {
    return { ...base, provider: 'deterministic' };
  }

  try {
    const enriched = await helpers.ask({
      system: 'You improve the clarity of contest requirement explanations. You never invent requirements.',
      schema: {
        type: 'object',
        properties: {
          rationales: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, rationale: { type: 'string' } }, required: ['key', 'rationale'] } },
          notes: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, message: { type: 'string' } }, required: ['type', 'message'] } },
        },
        required: ['rationales'],
      },
      prompt:
        'A brand wrote the contest brief below. For EACH requirement key listed, rewrite the rationale in one plain sentence a non-technical brand manager understands. ' +
        'Do not add keys. Do not invent facts about the brand or its products. Then list any genuine ambiguities or contradictions you can see in the brief.\n\n' +
        `${fence('brief', [contest?.title, contest?.description, contest?.contest_rules].filter(Boolean).join('\n'))}\n\n` +
        `Requirement keys: ${base.recommendations.map((r) => r.key).join(', ')}`,
    });

    const byKey = new Map((enriched?.rationales || []).map((r) => [r.key, r.rationale]));
    for (const r of base.recommendations) {
      const better = byKey.get(r.key);
      if (better && typeof better === 'string' && better.length > 10) r.rationale = better.slice(0, 400);
    }
    const extra = (enriched?.notes || []).filter((n) => n?.message).slice(0, 6);
    return { recommendations: base.recommendations, notes: [...base.notes, ...extra], provider: 'llm+deterministic' };
  } catch {
    // Enrichment is optional; the deterministic result stands.
    return { ...base, provider: 'deterministic' };
  }
}
