// @ts-nocheck
// RazeKit criteria library (spec 2).
//
// Criteria are STRUCTURED DATA, not UI strings, so the same definition drives
// the recommendation UI, the locked contest rules, and the compliance engine.
//
// `evaluability` is the honest part of this file. RazeKit can check structured
// facts (duration, platform, caption text, hashtags, a published URL, file
// format). It cannot watch a video. Anything requiring visual or audio
// judgement is marked `manual`, which routes to REVIEW_REQUIRED rather than
// pretending a machine verified it.
export const EVALUABILITY = {
  AUTO: 'auto',      // the engine can decide deterministically from stored data
  MANUAL: 'manual',  // needs a human; never auto-passes
};

export const CATEGORY = {
  CONTENT: 'content',
  BRANDING: 'branding',
  PUBLISHING: 'publishing',
  RESTRICTIONS: 'restrictions',
  DELIVERY: 'delivery',
  COLLABORATION: 'collaboration',
  HANDOVER: 'handover',
  CUSTOM: 'custom',
};

/**
 * The catalog. `evaluator` names a deterministic check in compliance/engine.ts;
 * criteria without one are manual by definition.
 */
export const CRITERIA_LIBRARY = [
  // ── CONTENT ───────────────────────────────────────────────────────────────
  { key: 'content.format', category: CATEGORY.CONTENT, label: 'Required content format',
    description: 'The deliverable must match the requested content format.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'contentType', params: { content_type: null } },
  { key: 'content.duration', category: CATEGORY.CONTENT, label: 'Required video duration',
    description: 'The video must fall inside the required duration range.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'duration', params: { min_seconds: null, max_seconds: null } },
  { key: 'content.supplied_footage', category: CATEGORY.CONTENT, label: 'Must use supplied footage',
    description: 'Only footage provided by the brand may be used.',
    evaluability: EVALUABILITY.MANUAL },
  { key: 'content.product_visible', category: CATEGORY.CONTENT, label: 'Product must appear',
    description: 'The product must be clearly visible in the video.',
    evaluability: EVALUABILITY.MANUAL },
  { key: 'content.opening_hook', category: CATEGORY.CONTENT, label: 'Required opening',
    description: 'The video must open as the brief specifies.',
    evaluability: EVALUABILITY.MANUAL },
  { key: 'content.cta', category: CATEGORY.CONTENT, label: 'Approved call to action',
    description: 'The submission must include the approved call to action.',
    // Checkable only where the CTA is written text we hold (caption/description).
    evaluability: EVALUABILITY.AUTO, evaluator: 'textContains', params: { phrases: [], fields: ['caption', 'description'] } },
  { key: 'content.language', category: CATEGORY.CONTENT, label: 'Required language',
    description: 'The content must be in the required language.',
    evaluability: EVALUABILITY.MANUAL },

  // ── BRANDING ──────────────────────────────────────────────────────────────
  { key: 'branding.logo', category: CATEGORY.BRANDING, label: 'Brand logo usage',
    description: 'The brand logo must appear as specified.', evaluability: EVALUABILITY.MANUAL },
  { key: 'branding.name_visible', category: CATEGORY.BRANDING, label: 'Brand name visible',
    description: 'The brand name must be visible or spoken.', evaluability: EVALUABILITY.MANUAL },
  { key: 'branding.approved_assets', category: CATEGORY.BRANDING, label: 'Approved assets only',
    description: 'Only brand-approved assets may be used.', evaluability: EVALUABILITY.MANUAL },

  // ── PUBLISHING ────────────────────────────────────────────────────────────
  { key: 'publishing.platform', category: CATEGORY.PUBLISHING, label: 'Required platform',
    description: 'The work must be published on the required platform.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'platform', params: { platforms: [] } },
  { key: 'publishing.published', category: CATEGORY.PUBLISHING, label: 'Must be published live',
    description: 'A public live URL is required.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'published' },
  { key: 'publishing.hashtags', category: CATEGORY.PUBLISHING, label: 'Required hashtags',
    description: 'The caption must include the required hashtags.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'hashtags', params: { tags: [] } },
  { key: 'publishing.mention', category: CATEGORY.PUBLISHING, label: 'Required tag or mention',
    description: 'The brand must be tagged or mentioned.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'mentions', params: { handles: [] } },
  { key: 'publishing.caption', category: CATEGORY.PUBLISHING, label: 'Caption required',
    description: 'A caption must be supplied with the submission.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'captionPresent' },

  // ── RESTRICTIONS ──────────────────────────────────────────────────────────
  { key: 'restrictions.no_competitors', category: CATEGORY.RESTRICTIONS, label: 'No competitor products',
    description: 'Competing products must not appear.', evaluability: EVALUABILITY.MANUAL },
  { key: 'restrictions.no_claims', category: CATEGORY.RESTRICTIONS, label: 'No unapproved claims',
    description: 'No performance or health claims beyond those approved.', evaluability: EVALUABILITY.MANUAL },
  { key: 'restrictions.no_banned_terms', category: CATEGORY.RESTRICTIONS, label: 'Prohibited wording',
    description: 'The submission must not contain prohibited wording.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'textExcludes', params: { phrases: [], fields: ['caption', 'description', 'title'] } },
  { key: 'restrictions.music', category: CATEGORY.RESTRICTIONS, label: 'Music restrictions',
    description: 'Only cleared or supplied audio may be used.', evaluability: EVALUABILITY.MANUAL },

  // ── DELIVERY ──────────────────────────────────────────────────────────────
  { key: 'delivery.deadline', category: CATEGORY.DELIVERY, label: 'Submit before the deadline',
    description: 'The submission must arrive before the contest deadline.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'deadline' },
  { key: 'delivery.aspect_ratio', category: CATEGORY.DELIVERY, label: 'Required aspect ratio',
    description: 'The video must use the required aspect ratio.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'aspectRatio', params: { ratios: [] } },
  { key: 'delivery.resolution', category: CATEGORY.DELIVERY, label: 'Minimum resolution',
    description: 'The video must meet the minimum resolution.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'resolution', params: { min_height: null } },
  { key: 'delivery.asset_attached', category: CATEGORY.DELIVERY, label: 'Final asset attached',
    description: 'The final creative file or live URL must be attached.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'assetAttached' },

  // ── COLLABORATION ─────────────────────────────────────────────────────────
  { key: 'collaboration.required', category: CATEGORY.COLLABORATION, label: 'Collaboration required',
    description: 'The creator must collaborate with the brand as described.',
    evaluability: EVALUABILITY.MANUAL },
  { key: 'collaboration.approval', category: CATEGORY.COLLABORATION, label: 'Content approval required',
    description: 'The brand must approve the content before publishing.',
    evaluability: EVALUABILITY.MANUAL },

  // ── ACCOUNT HANDOVER ──────────────────────────────────────────────────────
  // Backed by the real Handover entity + /contest/:id/handover flow.
  { key: 'handover.required', category: CATEGORY.HANDOVER, label: 'Account handover required',
    description: 'The winning creator must complete the RazeKit account handover.',
    evaluability: EVALUABILITY.AUTO, evaluator: 'handoverConfigured' },
  { key: 'handover.ownership_transfer', category: CATEGORY.HANDOVER, label: 'Ownership transfer',
    description: 'Ownership of the campaign account transfers to the brand.',
    evaluability: EVALUABILITY.MANUAL },
  { key: 'handover.access', category: CATEGORY.HANDOVER, label: 'Access handover',
    description: 'Account access must be handed to the brand.',
    evaluability: EVALUABILITY.MANUAL },
];

export const BY_KEY = new Map(CRITERIA_LIBRARY.map((c) => [c.key, c]));

export function criterionDefinition(key) {
  return BY_KEY.get(key) || null;
}

/** A client-authored rule. Always manual — RazeKit cannot machine-check free text. */
export function customCriterion(text, position = 0) {
  return {
    key: `custom.${position + 1}`,
    category: CATEGORY.CUSTOM,
    label: String(text || '').slice(0, 200),
    description: String(text || '').slice(0, 1000),
    evaluability: EVALUABILITY.MANUAL,
    source: 'custom',
  };
}

/** Stable hash of a locked rule set, so a version is provably unchanged. */
export function criteriaHash(criteria) {
  const canonical = (criteria || [])
    .map((c) => `${c.key}|${c.mandatory ? 1 : 0}|${(c.label || '').trim()}|${JSON.stringify(c.params || {})}`)
    .sort()
    .join('\n');
  let h1 = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h1 ^= canonical.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return `rkc1-${h1.toString(16).padStart(8, '0')}-${canonical.length}`;
}
