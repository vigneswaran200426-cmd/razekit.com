// Derives the submission requirements from the contest configuration.
// The frontend renders THIS — never hard-coded business rules in components.
// The server (RLS + entity validation) remains the authoritative gate;
// this is the creator-facing contract derived from real contest fields.

import { PLATFORMS, PLATFORMS_BY_ID, platformById } from './platforms';

export function safeParse(s, fallback = []) {
  if (Array.isArray(s)) return s;
  if (!s) return fallback;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

const DURATION_MAP = {
  '15 Seconds': 15, '30 Seconds': 30, '45 Seconds': 45, '60 Seconds': 60,
  '90 Seconds': 90, '3 Minutes': 180, '5 Minutes': 300, '10 Minutes': 600,
};

const CATEGORY_PLATFORM = {
  'Instagram Reel': ['instagram'],
  'YouTube Shorts': ['youtube'],
  'YouTube Video': ['youtube'],
};

function platformIdFromLabel(label) {
  if (!label) return null;
  const l = String(label).toLowerCase();
  if (l.includes('instagram')) return 'instagram';
  if (l.includes('tiktok')) return 'tiktok';
  if (l.includes('youtube')) return 'youtube';
  if (l.includes('facebook')) return 'facebook';
  if (l.includes('linkedin')) return 'linkedin';
  if (l.includes('pinterest')) return 'pinterest';
  if (l.includes('thread')) return 'threads';
  if (l === 'x' || l.includes('twitter')) return 'x';
  return null;
}

function parseNum(v) {
  const n = parseFloat(String(v || '').replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

// A contest accepts submissions while it is live and before the deadline.
// The deadline check at submit time re-reads the contest record — never browser time alone.
export function isContestOpen(contest, now = Date.now()) {
  if (!contest) return false;
  const openStatus = ['open', 'joined', 'working', 'submitted', 'reviewing'];
  return openStatus.includes(contest.status) && new Date(contest.deadline).getTime() > now;
}

export function deriveRequirements(contest) {
  const deliverables = safeParse(contest?.deliverables);
  const customReqs = safeParse(contest?.custom_requirements);
  const rulesText = [
    contest?.contest_rules || '',
    contest?.brief || '',
    customReqs.filter(Boolean).join('\n'),
  ].join('\n');
  const rules = rulesText.toLowerCase();

  // ── Platforms ──
  let platforms = deliverables
    .map((d) => platformIdFromLabel(d?.platform || d?.contentType))
    .filter(Boolean);
  platforms = [...new Set(platforms)];
  if (!platforms.length) platforms = CATEGORY_PLATFORM[contest?.category] || [];

  // ── Format ──
  const maxDurationSec =
    DURATION_MAP[contest?.video_duration] ||
    (contest?.video_duration === 'Custom' ? parseNum(contest?.custom_duration) : null) ||
    (deliverables.length ? Math.max(...deliverables.map((d) => parseNum(d?.duration)).filter(Boolean)) : null);

  const aspectRatios = [...new Set(deliverables.map((d) => d?.ratio).filter(Boolean))];
  const resolutions = [...new Set(deliverables.map((d) => d?.resolution).filter(Boolean))];

  // ── Field requirements ──
  const requireLiveUrl = deliverables.some((d) => d?.requireLiveUrl) || /live (url|post|link)|published url/.test(rules);
  const requireCaption = deliverables.some((d) => d?.requireCaption) || /caption|post copy/.test(rules);
  const requireHashtags = deliverables.some((d) => d?.requireHashtags) || /hashtag/.test(rules);
  const requireMentions = deliverables.some((d) => d?.requireMentions) || /mention|tag @/.test(rules);

  // ── Brand-required messaging (extracted from the real brief text) ──
  const requiredMentions = [...new Set((rulesText.match(/@[A-Za-z0-9._]+/g) || []).map((s) => s.toLowerCase()))];
  const requiredHashtags = [...new Set((rulesText.match(/#[A-Za-z0-9_]+/g) || []).map((s) => s.toLowerCase()))];
  const ctaMatch = rulesText.match(/cta\s*[:\-–]\s*([^\n]+)/i);
  const requiredCTA = ctaMatch ? ctaMatch[1].trim() : null;

  // ── Source files ──
  const rawFootageRequired = /raw footage/.test(rules);
  const projectFileRequired = /project file/.test(rules);
  const thumbnailRequired = /thumbnail|cover image/.test(rules);
  const audioRequired = /audio file/.test(rules);
  const sourceFiles = [{ id: 'final', label: 'Final export', required: true, desc: 'The finished creative the brand will review.' }];
  if (rawFootageRequired || /source file/.test(rules))
    sourceFiles.push({ id: 'raw', label: 'Raw footage', required: rawFootageRequired, desc: 'Unedited source clips used in the edit.' });
  if (projectFileRequired || (contest?.preferred_software && contest.preferred_software !== 'Any'))
    sourceFiles.push({ id: 'project', label: `Project file (${contest?.preferred_software || 'editing software'})`, required: projectFileRequired, desc: 'The editable project file.' });
  if (audioRequired) sourceFiles.push({ id: 'audio', label: 'Audio files', required: true });
  if (thumbnailRequired) sourceFiles.push({ id: 'thumbnail', label: 'Thumbnail / cover image', required: true });

  // ── Post-win workflow (from contest configuration only — never invented) ──
  const postWinAction =
    contest?.post_winner_action || (contest?.handover_required ? 'ACCOUNT_HANDOVER' : 'NONE');

  return {
    contestId: contest?.id,
    platforms,
    freePlatformChoice: platforms.length === 0,
    maxDurationSec,
    aspectRatios,
    resolutions,
    requireLiveUrl,
    requireCaption,
    requireHashtags,
    requireMentions,
    requiredMentions,
    requiredHashtags,
    requiredCTA,
    sourceFiles,
    postWinAction,
    handover: {
      required: postWinAction === 'ACCOUNT_HANDOVER',
      type: contest?.handover_type || null,
      scope: contest?.account_property_type || null,
      deadline: contest?.handover_deadline || null,
      notes: contest?.handover_notes || null,
    },
    collaboration: {
      required: postWinAction === 'CLIENT_COLLABORATION',
      type: contest?.collaboration_type || null,
      duration: contest?.collaboration_duration || null,
      responsibilities: contest?.collaboration_responsibilities || null,
      notes: contest?.collaboration_notes || null,
    },
    winnerContent: { required: true }, // standard Razekit post-win publishing flow
    submissionLimit: contest?.submission_limit || 0,
    deadline: contest?.deadline,
    prize: contest?.prize_amount,
    currency: contest?.currency || 'INR',
  };
}

// ── Checklist ──────────────────────────────────────────────────────────

export function fieldRequired(reqs, field) {
  if (field.required === true) return true;
  if (field.optional) return false;
  switch (field.key) {
    case 'live_url': return reqs.requireLiveUrl;
    case 'caption': return reqs.requireCaption;
    case 'hashtags': return reqs.requireHashtags;
    case 'mentions': return reqs.requireMentions;
    default: return false;
  }
}

export function isValidUrl(v) {
  try {
    const u = new URL(String(v || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// One platform entry (tab) is complete when all its required fields are valid.
export function entryComplete(reqs, entry) {
  const p = platformById(entry.platformId);
  if (!p || !entry) return false;
  if (p.customPlatform && !String(entry.fields?.platform_name || '').trim()) return false;
  if (!entry.contentType) return false;
  return p.fields.every((f) => {
    if (!fieldRequired(reqs, f)) return true;
    if (f.key === 'live_url' && entry.notPublished) return true;
    if (f.type === 'image') return Boolean(entry.fields?.[f.key]);
    if (f.type === 'url') return isValidUrl(entry.fields?.[f.key]) && (!f.pattern || f.pattern.test(String(entry.fields?.[f.key])));
    return Boolean(String(entry.fields?.[f.key] || '').trim());
  });
}

function brandMessagingDone(reqs, state) {
  if (!reqs.requiredMentions.length && !reqs.requiredHashtags.length) return true;
  const text = (state.platforms || [])
    .map((e) => `${e.fields?.caption || ''} ${e.fields?.hashtags || ''} ${e.fields?.mentions || ''}`)
    .join(' ')
    .toLowerCase();
  const ok = (list) => list.every((m) => text.includes(m));
  return ok(reqs.requiredMentions) && ok(reqs.requiredHashtags);
}

// Live submission checklist — the single source both the right rail and the
// final check render from. `skip` items don't apply to this contest.
export function buildChecklist(reqs, state, { includeTerms = false } = {}) {
  const active = (state.platforms || []).filter((e) => e.platformId);
  const items = [];

  items.push({ id: 'final', label: 'Final creative uploaded', done: Boolean(state.final?.file_uri) });

  const dur = state.final?.meta?.duration;
  items.push({
    id: 'duration',
    label: reqs.maxDurationSec ? `Video within the ${reqs.maxDurationSec}s duration limit` : 'Video duration',
    done: dur ? dur <= reqs.maxDurationSec + 1 : true,
    skip: !state.final?.file_uri,
  });

  items.push({ id: 'platform', label: 'Platform & content type selected', done: active.length > 0 && active.every((e) => entryComplete(reqs, e) || e.contentType) && active.every((e) => e.contentType) });

  items.push({ id: 'platformDetails', label: 'Platform details complete', done: active.length > 0 && active.every((e) => entryComplete(reqs, e)) });

  const hasBrandMsg = reqs.requiredMentions.length > 0 || reqs.requiredHashtags.length > 0;
  items.push({ id: 'brandMsg', label: 'Required brand messaging included', done: brandMessagingDone(reqs, state), skip: !hasBrandMsg });

  const requiredSource = reqs.sourceFiles.filter((f) => f.required && f.id !== 'final');
  items.push({
    id: 'source',
    label: 'Required source files uploaded',
    done: requiredSource.every((f) => (state.sourceFiles || []).some((s) => s.type === f.id)),
    skip: requiredSource.length === 0,
  });

  if (includeTerms) {
    items.push({
      id: 'terms',
      label: 'Originality & terms confirmed',
      done: Boolean(state.terms?.original) && (!reqs.handover.required && !reqs.collaboration.required ? true : Boolean(state.terms?.postWin)),
    });
  }
  return items;
}

export function missingBeforeSubmit(reqs, state) {
  return buildChecklist(reqs, state, { includeTerms: true })
    .filter((i) => !i.skip && !i.done)
    .map((i) => i.label);
}