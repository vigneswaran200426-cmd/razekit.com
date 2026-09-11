// Social publication URLs — where a creator's pasted "live link" either becomes
// evidence RazeKit is willing to stand behind, or is refused.
//
// The problem: a creator publishes their entry on Instagram (or YouTube, or
// TikTok…) and pastes the link. Until that string is parsed it is a CLAIM, not
// evidence. Without this module the Winners Hub would be offering
// "View on Instagram" for a link nobody checked — or for a YouTube link the
// creator labelled "Instagram" to get past an Instagram-only contest.
//
// What this module refuses to do:
//   • Fetch the URL. RazeKit has no platform API credentials (see
//     verification/platforms.ts, which is built around that same fact), so
//     nothing here claims the post exists, is public, is the creator's, or
//     carries any metric. A parsed link means "this is the shape of a real
//     public <platform> post URL" and nothing more.
//   • Construct or guess a URL. It only narrows one the creator typed: lower-
//     cases the host, drops the fragment, and drops query parameters that are
//     not part of the post's identity. A link it cannot parse is reported as
//     unparseable — never repaired into something that looks valid.
//   • Re-host or scrape third-party content, or imitate another platform's UI.
//
// SSRF / credential / private-host hygiene is NOT reimplemented here: it is
// traffic/url.ts validateDestinationUrl, the same guard the tracking-link
// redirect is protected by. verification/platforms.ts validateUrl was not
// reused as the base because it accepts http://, is keyed by the platform the
// CLIENT claims, and inspects neither credentials nor ports — the three things
// this path must not concede. Its per-platform host regexes are, however, the
// same shape as the host lists below.
import { validateDestinationUrl } from '../traffic/url.js';

export type PlatformKey = 'instagram' | 'youtube' | 'tiktok' | 'x' | 'facebook' | 'linkedin';

/** Persisted Submission.url_status vocabulary. Deliberately only two states:
 *  a rejected link never reaches the database — the write is refused. */
export const URL_STATUS = {
  /** No live link on the entry yet. NOT a failure — most entries start here. */
  NOT_PUBLISHED: 'not_published',
  /** The link is a well-formed public post URL on a genuine platform host.
   *  It does NOT mean the post was opened, exists, or belongs to this creator. */
  LINK_VALID: 'link_valid',
} as const;

interface PostPath {
  readonly re: RegExp;
  /** Limits the pattern to these hosts (used for shorteners like youtu.be,
   *  whose bare-id path would otherwise swallow youtube.com/results). */
  readonly hosts?: readonly string[];
}

export interface PlatformPattern {
  readonly key: PlatformKey;
  readonly label: string;
  /**
   * Hostnames that are GENUINELY this platform. Compared with === after
   * lower-casing, never with endsWith: a suffix test accepts
   * instagram.com.evil.example, which is the whole attack.
   */
  readonly hosts: readonly string[];
  /** Path shapes that identify a single post. Capture group 1, where present, is the post id. */
  readonly postPaths: readonly PostPath[];
  /** Query parameters that are part of the post's identity and survive
   *  normalization. Everything else (utm_*, igsh, si, fbclid, …) is dropped. */
  readonly identityParams: readonly string[];
  /** Query parameter carrying the post id where the path does not (YouTube /watch?v=). */
  readonly idParam?: string;
  /**
   * TRUE only where the platform serves an official embed to a LOGGED-OUT
   * visitor with no app id, no access token and no third-party JS widget.
   * Anything else is false and the Hub falls back to RazeKit-hosted media plus
   * a "View on <platform>" link — an honest fallback beats a broken iframe.
   * Flipping one of these to true requires actually checking a logged-out
   * render, not assuming the platform's documentation still holds.
   */
  readonly embed: boolean;
  readonly embedNote: string;
}

export const PLATFORM_PATTERNS: Record<PlatformKey, PlatformPattern> = {
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    hosts: ['instagram.com', 'www.instagram.com', 'm.instagram.com'],
    postPaths: [
      { re: /^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,32})\/?$/ },
      // Instagram also serves reels under the author's handle.
      { re: /^\/[A-Za-z0-9._]{1,30}\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,32})\/?$/ },
    ],
    identityParams: [],
    embed: false,
    embedNote: 'Instagram oEmbed requires a Meta app token, and the /embed iframe is not dependable for logged-out visitors.',
  },
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'],
    postPaths: [
      { re: /^\/watch\/?$/ }, // id lives in ?v=
      { re: /^\/shorts\/([A-Za-z0-9_-]{6,20})\/?$/ },
      { re: /^\/live\/([A-Za-z0-9_-]{6,20})\/?$/ },
      { re: /^\/embed\/([A-Za-z0-9_-]{6,20})\/?$/ },
      { re: /^\/([A-Za-z0-9_-]{6,20})\/?$/, hosts: ['youtu.be'] },
    ],
    identityParams: ['v'],
    idParam: 'v',
    // The only one of the six. youtube.com/embed/<id> renders for anyone, with
    // no key and no script.
    embed: true,
    embedNote: 'youtube.com/embed/<id> is a public iframe: no API key, no token, no widget script.',
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    hosts: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'],
    // vm.tiktok.com / vt.tiktok.com share links are deliberately NOT accepted:
    // the id is opaque and resolving it would mean fetching the link, which
    // this module does not do. The creator is asked for the full link instead.
    postPaths: [{ re: /^\/@[A-Za-z0-9._]{1,30}\/(?:video|photo)\/(\d{5,25})\/?$/ }],
    identityParams: [],
    embed: false,
    embedNote: 'TikTok embeds depend on their widget script and are blocked in some regions; not verified for logged-out visitors.',
  },
  x: {
    key: 'x',
    label: 'X',
    hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'],
    postPaths: [{ re: /^\/[A-Za-z0-9_]{1,20}\/status(?:es)?\/(\d{5,25})(?:\/(?:photo|video)\/\d{1,2})?\/?$/ }],
    identityParams: [],
    embed: false,
    embedNote: 'The X embed is a JS widget that frequently refuses to render for logged-out visitors.',
  },
  facebook: {
    key: 'facebook',
    label: 'Facebook',
    hosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'],
    postPaths: [
      { re: /^\/watch\/?$/ }, // id lives in ?v=
      { re: /^\/reel\/(\d{5,25})\/?$/ },
      { re: /^\/[A-Za-z0-9.\-]{1,60}\/videos\/(?:[A-Za-z0-9.\-]{1,80}\/)?(\d{5,25})\/?$/ },
      { re: /^\/[A-Za-z0-9.\-]{1,60}\/posts\/([A-Za-z0-9]{5,120})\/?$/ },
      { re: /^\/share\/[rvp]\/([A-Za-z0-9]{5,40})\/?$/ },
    ],
    identityParams: ['v'],
    idParam: 'v',
    embed: false,
    embedNote: 'Facebook oEmbed requires a Meta app token; the plugin iframe requires their SDK.',
  },
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn',
    hosts: ['linkedin.com', 'www.linkedin.com'],
    postPaths: [
      { re: /^\/posts\/([A-Za-z0-9_%.-]{3,200})\/?$/ },
      { re: /^\/feed\/update\/(urn:li:(?:activity|ugcPost|share):\d{5,30})\/?$/ },
    ],
    identityParams: [],
    embed: false,
    embedNote: 'LinkedIn embeds need a share URN RazeKit cannot derive from a post link without guessing.',
  },
};

const PLATFORM_LIST = Object.values(PLATFORM_PATTERNS);

/** Spellings a human or an older row might use for a platform. */
const PLATFORM_ALIASES: Record<string, PlatformKey> = {
  ig: 'instagram', insta: 'instagram', instagram: 'instagram',
  yt: 'youtube', youtube: 'youtube', 'youtube shorts': 'youtube', shorts: 'youtube',
  tiktok: 'tiktok', 'tik tok': 'tiktok',
  x: 'x', twitter: 'x', 'x (twitter)': 'x', 'twitter/x': 'x',
  fb: 'facebook', facebook: 'facebook', 'facebook reels': 'facebook',
  li: 'linkedin', linkedin: 'linkedin',
};

/** Canonical key for a platform name from any surface, or null if unrecognised. */
export function normalizePlatformKey(value: unknown): PlatformKey | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  return PLATFORM_ALIASES[v] || (PLATFORM_PATTERNS as Record<string, PlatformPattern>)[v]?.key || null;
}

/** Display name for a canonical key. Falls back to whatever was stored, so a
 *  legacy value still renders as itself rather than disappearing. */
export function platformLabel(value: unknown): string | null {
  const key = normalizePlatformKey(value);
  if (key) return PLATFORM_PATTERNS[key].label;
  const raw = String(value ?? '').trim();
  return raw || null;
}

export interface PublicationParse {
  ok: boolean;
  platform: PlatformKey | null;
  external_id: string | null;
  normalized_url: string | null;
  /** Always populated: the sentence stored in Submission.url_check_reason and
   *  shown to the creator. On success it states what was NOT checked. */
  reason: string | null;
}

function fail(reason: string): PublicationParse {
  return { ok: false, platform: null, external_id: null, normalized_url: null, reason };
}

const SUPPORTED_LABELS = PLATFORM_LIST.map((p) => p.label).join(', ');

/**
 * Parse a creator-supplied published-post URL.
 *
 * Returns the platform, the post id where the URL shape carries one, and a
 * normalized URL with tracking parameters removed. Never invents any of them:
 * an unrecognised host, a profile link, or a shortener comes back ok:false with
 * a reason a creator can act on.
 */
export function parsePublicationUrl(url: unknown): PublicationParse {
  const value = String(url ?? '').trim();
  if (!value) return fail('No link was provided.');
  if (value.length > 2048) return fail('That link is too long to be a post URL.');

  // https only. A published social post is always available over https, and an
  // http link would let a network attacker choose what the "evidence" points at.
  if (!/^https:\/\//i.test(value)) {
    return fail('Paste the full https:// link to your published post.');
  }

  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return fail('That does not look like a valid link.');
  }

  if (u.username || u.password) return fail('A post link must not contain a username or password.');
  if (u.port) return fail('A published post link does not have a port number.');

  // The shared SSRF / private-host guard. Same decision the tracking-link
  // redirect makes, so there is one answer to "is this a real public address"
  // in the codebase rather than two that can drift apart.
  const guard = validateDestinationUrl(value) as { ok: boolean; message?: string };
  if (!guard.ok) return fail('That link is not a public social media address.');

  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const platform = PLATFORM_LIST.find((p) => p.hosts.includes(host)) || null;
  if (!platform) {
    return fail(`RazeKit does not recognise ${host} as a supported platform. Supported: ${SUPPORTED_LABELS}.`);
  }

  const path = u.pathname;
  let matched: RegExpExecArray | null = null;
  for (const p of platform.postPaths) {
    if (p.hosts && !p.hosts.includes(host)) continue;
    const m = p.re.exec(path);
    if (m) { matched = m; break; }
  }
  if (!matched) {
    return fail(`That ${platform.label} link is not a single post link. Open the post itself and copy its link from there.`);
  }

  // The id comes from the path, or from the identity query parameter where the
  // platform puts it there instead. If neither carries one, it stays null —
  // a missing id is reported, not fabricated.
  let externalId: string | null = matched[1] ? decodeURIComponent(matched[1]) : null;
  if (!externalId && platform.idParam) {
    const fromQuery = u.searchParams.get(platform.idParam);
    if (fromQuery && /^[A-Za-z0-9_-]{5,30}$/.test(fromQuery)) externalId = fromQuery;
  }
  if (!externalId && platform.idParam) {
    // The only id-less path shape on these platforms is /watch, and /watch
    // without a usable ?v= does not point at a post.
    return fail(`That ${platform.label} link does not point at a specific video.`);
  }

  // Normalize: same host, same path, minus the fragment and minus every query
  // parameter that is not part of the post's identity. Nothing is added.
  const out = new URL(u.toString());
  out.protocol = 'https:';
  out.hostname = host;
  out.hash = '';
  const keep = new URLSearchParams();
  for (const name of platform.identityParams) {
    const v = u.searchParams.get(name);
    if (v) keep.set(name, v);
  }
  const q = keep.toString();
  out.search = q ? `?${q}` : '';

  return {
    ok: true,
    platform: platform.key,
    external_id: externalId,
    normalized_url: out.toString(),
    reason: `Recognised as a public ${platform.label} post link. RazeKit has not opened the post — it has no ${platform.label} API access, so the post's content, ownership and performance are not confirmed by this check.`,
  };
}

/** Raised when a submission's platform is not the one its contest requires. */
export class PublicationError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'PublicationError';
    this.status = status;
  }
}

/**
 * Enforce a contest's required_platform.
 *
 * Some contests are single-platform by design — the three RazeKit promo
 * contests are Instagram only — and the rule has to hold on the server, because
 * the platform a submission "says" it is can be anything the client typed.
 * Call it with the PARSED platform, never the claimed one.
 *
 * Throws PublicationError (422) on a mismatch; returns the required key (or
 * null when the contest has no platform rule) otherwise.
 */
export function assertPlatformAllowed(
  { contest, platform }: { contest?: Record<string, any> | null; platform: unknown }
): { required: string | null } {
  const rawRequired = String(contest?.required_platform ?? '').trim();
  if (!rawRequired) return { required: null };

  const required = normalizePlatformKey(rawRequired);
  const claimed = normalizePlatformKey(platform);
  const requiredLabel = required ? PLATFORM_PATTERNS[required].label : rawRequired;

  // A required platform RazeKit does not model is still enforced, by comparing
  // the raw strings. Silently allowing anything through would be worse.
  const matches = required && claimed
    ? required === claimed
    : rawRequired.toLowerCase() === String(platform ?? '').trim().toLowerCase();

  if (!matches) {
    const got = platformLabel(platform);
    throw new PublicationError(
      got
        ? `This contest accepts ${requiredLabel} entries only, and that link is ${got}. Publish on ${requiredLabel} and paste that link.`
        : `This contest accepts ${requiredLabel} entries only. Paste the link to your ${requiredLabel} post.`
    );
  }
  return { required: required || rawRequired };
}

export interface PublicationEvidence {
  platform: PlatformKey | null;
  original_post_url: string | null;
  original_published_at: string | null;
  embed_available: boolean;
}

const NO_EVIDENCE: PublicationEvidence = {
  platform: null,
  original_post_url: null,
  original_published_at: null,
  embed_available: false,
};

/** True only for a platform with a genuine public embed AND an id to embed. */
export function embedAvailable(platform: unknown, externalId: unknown): boolean {
  const key = normalizePlatformKey(platform);
  if (!key) return false;
  return PLATFORM_PATTERNS[key].embed && Boolean(String(externalId ?? '').trim());
}

/**
 * The tuple the Winners Hub needs to show "View on <platform>" honestly.
 *
 * The stored row is re-parsed rather than trusted: a row written before this
 * guard existed (or by an import) must not be able to put an unchecked URL in
 * front of the public. No verified link means all-null and embed_available
 * false — the Hub then shows the RazeKit-hosted winning video with no external
 * link, which is the true state of what RazeKit knows.
 */
export function publicationEvidence(submission: Record<string, any> | null | undefined): PublicationEvidence {
  const s = submission || {};
  if (s.url_status !== URL_STATUS.LINK_VALID) return { ...NO_EVIDENCE };
  const parsed = parsePublicationUrl(s.live_url);
  if (!parsed.ok) return { ...NO_EVIDENCE };
  return {
    platform: parsed.platform,
    original_post_url: parsed.normalized_url,
    // Set by the entity guard the first time RazeKit saw a valid live link for
    // this entry. It is a "first seen live" floor, NOT a timestamp read from
    // the platform — RazeKit cannot read one. Label it accordingly in the UI.
    original_published_at: s.published_at || null,
    embed_available: embedAvailable(parsed.platform, parsed.external_id),
  };
}

// ── Entity-service guard ─────────────────────────────────────────────────────

/**
 * Fields whose value is derived from the live URL. A write touching ANY of them
 * re-derives all of them, so a client cannot PATCH url_status='link_valid' (or
 * a published_at of its choosing) without a link that actually parses.
 */
const PUBLICATION_INPUTS = [
  'live_url', 'platform', 'url_status', 'post_external_id',
  'url_checked_at', 'url_check_reason', 'platform_locked', 'published_at',
];

/**
 * True when a write actually CHANGES a publication field.
 *
 * Presence is not enough: clients that PATCH a whole object re-send unchanged
 * values, and an entry created before this rule existed must never be
 * retro-broken by a write that did not touch its link.
 */
export function touchesPublication(patch: Record<string, unknown>, prev?: Record<string, unknown> | null): boolean {
  return PUBLICATION_INPUTS.some((k) => {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, k)) return false;
    if (!prev) return true;
    return JSON.stringify(prev[k]) !== JSON.stringify((patch as any)[k]);
  });
}

/**
 * Validate and stamp the publication fields on a merged Submission payload.
 * Mutates `data`. Raises through `raise` (the entity service turns that into
 * an EntityError) so no API path, script or internal mutation can bypass it.
 *
 * `prev` is the row as it stands, and is the ONLY source for published_at:
 * the client never gets to say when something went live.
 */
export function enforceSubmissionPublication(
  data: Record<string, any>,
  opts: { contest?: Record<string, any> | null; prev?: Record<string, any> | null },
  raise: (message: string, status: number) => void
): void {
  const { contest = null, prev = null } = opts || {};
  const raw = typeof data.live_url === 'string' ? data.live_url.trim() : '';
  const now = new Date().toISOString();
  const carriedPublishedAt = prev?.published_at || null;

  const refuse = (message: string) => {
    raise(message, 422);
    // raise always throws in practice; this keeps the function honest if it ever does not.
    throw new PublicationError(message);
  };

  if (!raw) {
    // Not published yet. Still check the platform the creator picked against a
    // contest that demands one — catching it at draft time beats catching it
    // at judging time.
    if (data.platform) {
      const claimed = normalizePlatformKey(data.platform);
      try {
        assertPlatformAllowed({ contest, platform: claimed || data.platform });
      } catch (e: any) {
        refuse(e?.message || 'That platform is not allowed for this contest.');
      }
      if (claimed) data.platform = claimed;
    }
    // Empty, whitespace, or a non-string the client tried to smuggle in: there
    // is no link, so every field derived from one is cleared rather than left
    // holding the previous link's answer.
    data.live_url = null;
    data.url_status = URL_STATUS.NOT_PUBLISHED;
    data.post_external_id = null;
    data.url_check_reason = 'No live link on this entry yet.';
    data.url_checked_at = now;
    data.platform_locked = false;
    data.published_at = carriedPublishedAt;
    return;
  }

  const parsed = parsePublicationUrl(raw);
  if (!parsed.ok) refuse(parsed.reason || 'That link could not be verified.');

  try {
    assertPlatformAllowed({ contest, platform: parsed.platform });
  } catch (e: any) {
    refuse(e?.message || 'That platform is not allowed for this contest.');
  }

  // The PARSED platform wins over the claimed one. Labelling an Instagram link
  // "YouTube" to dodge a contest's platform rule ends here.
  data.platform = parsed.platform;
  data.live_url = parsed.normalized_url;
  data.url_status = URL_STATUS.LINK_VALID;
  data.post_external_id = parsed.external_id;
  data.url_check_reason = parsed.reason;
  data.url_checked_at = now;
  data.platform_locked = true;
  // Earliest moment RazeKit can attest the post was live, never moved forward
  // on re-validation and never accepted from the client.
  data.published_at = carriedPublishedAt || now;
}
