// @ts-nocheck
// Social platform verification.
//
// RazeKit has no social platform API credentials. That is a fact, and this
// module is built around it rather than around a pretence.
//
// What RazeKit CAN prove without any API key: that the person claiming an
// account can publish to it. We issue a one-time code, the creator places it
// somewhere public they control, and we fetch that public page and look for it.
// That is genuine ownership evidence, obtained from public data, with no
// password and no token.
//
// What RazeKit CANNOT do today: read follower counts, pull post metrics, or
// call an official API. Where that is required, the state is NOT_SUPPORTED or
// MANUAL_REVIEW — never a fabricated success.
//
// The adapter shape below is the seam a real API integration slots into later.

export const VERIFICATION_STATUS = {
  /** Created, no platform chosen yet. */
  PENDING: 'PENDING',
  /** A challenge code has been issued and is waiting to be placed. */
  CODE_ISSUED: 'CODE_ISSUED',
  /** The creator says the code is live and gave us a URL to check. */
  SUBMITTED: 'SUBMITTED',
  /** Ownership evidence was found. This is the only state that unlocks payout. */
  VERIFIED: 'VERIFIED',
  /** Automatic checking could not reach a conclusion; a person must look. */
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  /** Checked and the evidence was not there. The creator may retry. */
  FAILED: 'FAILED',
  /** RazeKit cannot verify this platform at all. Says so plainly. */
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  /** The creator withdrew or the window closed. */
  EXPIRED: 'EXPIRED',
};

/** Only VERIFIED unlocks money. Nothing else, ever. */
export function isVerified(status) {
  return status === VERIFICATION_STATUS.VERIFIED;
}

export const VERIFICATION_COPY = {
  PENDING: { label: 'Not started', tone: 'neutral', detail: 'Choose the platform you published on to begin.' },
  CODE_ISSUED: { label: 'Code issued', tone: 'primary', detail: 'Add your verification code where we can see it, then submit the link.' },
  SUBMITTED: { label: 'Checking', tone: 'primary', detail: 'We are checking your link for the verification code.' },
  VERIFIED: { label: 'Verified', tone: 'success', detail: 'We confirmed you control this account.' },
  MANUAL_REVIEW: { label: 'Being reviewed', tone: 'warning', detail: 'We could not check this automatically, so a person is reviewing it. You do not need to do anything.' },
  FAILED: { label: 'Not verified', tone: 'danger', detail: 'We could not find your verification code. Check it is public and try again.' },
  NOT_SUPPORTED: { label: 'Manual verification', tone: 'warning', detail: 'RazeKit cannot check this platform automatically. A person will verify it with you.' },
  EXPIRED: { label: 'Expired', tone: 'neutral', detail: 'This verification expired. Start it again.' },
};

/**
 * Supported platforms.
 *
 * `autoCheck` means RazeKit can fetch a public page and look for the code. It
 * does NOT mean an official API is connected — none is. `apiIntegration` says
 * so explicitly so no surface can imply otherwise.
 */
export const PLATFORMS = {
  youtube: {
    key: 'youtube', label: 'YouTube',
    // YouTube serves the description in server-rendered HTML, so a public fetch
    // genuinely finds the code.
    autoCheck: true, apiIntegration: false,
    placement: 'Add the code to your video description, or to your channel description.',
    urlHint: 'https://www.youtube.com/watch?v=… or your channel URL',
    urlPattern: /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i,
  },
  instagram: {
    key: 'instagram', label: 'Instagram',
    // Instagram renders posts client-side and blocks unauthenticated fetches,
    // so an automatic check would be unreliable. Say so rather than guess.
    autoCheck: false, apiIntegration: false,
    placement: 'Add the code to your bio, or to the caption of your entry.',
    urlHint: 'https://www.instagram.com/p/… or your profile URL',
    urlPattern: /^https?:\/\/(www\.)?instagram\.com\//i,
  },
  tiktok: {
    key: 'tiktok', label: 'TikTok',
    autoCheck: false, apiIntegration: false,
    placement: 'Add the code to your bio, or to the caption of your entry.',
    urlHint: 'https://www.tiktok.com/@handle/video/…',
    urlPattern: /^https?:\/\/(www\.|m\.)?tiktok\.com\//i,
  },
  x: {
    key: 'x', label: 'X',
    autoCheck: false, apiIntegration: false,
    placement: 'Post the code from the account, or add it to your bio.',
    urlHint: 'https://x.com/handle/status/…',
    urlPattern: /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//i,
  },
  facebook: {
    key: 'facebook', label: 'Facebook',
    autoCheck: false, apiIntegration: false,
    placement: 'Add the code to the post, or to your page description.',
    urlHint: 'https://www.facebook.com/…',
    urlPattern: /^https?:\/\/(www\.|m\.)?facebook\.com\//i,
  },
  other: {
    key: 'other', label: 'Another platform',
    autoCheck: false, apiIntegration: false,
    placement: 'Add the code somewhere publicly visible on the account.',
    urlHint: 'The public URL of your entry or profile',
    urlPattern: /^https?:\/\/.+/i,
  },
};

export function platformFor(key) {
  return PLATFORMS[String(key || '').toLowerCase()] || null;
}

export function listPlatforms() {
  return Object.values(PLATFORMS).map((p) => ({
    key: p.key,
    label: p.label,
    // Stated per platform so the UI can set the right expectation up front
    // instead of promising instant verification it cannot deliver.
    automatic: p.autoCheck,
    api_integration: p.apiIntegration,
    placement: p.placement,
    url_hint: p.urlHint,
  }));
}

/**
 * A one-time ownership challenge.
 *
 * Deliberately unambiguous and hard to produce by accident, but short enough to
 * type into a bio. Not a secret — its only job is to be something a stranger
 * could not have placed on that account.
 */
export function issueChallenge() {
  // Excludes look-alike characters (0/O, 1/I) so a creator does not fail
  // verification over a font.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `RAZEKIT-${code}`;
}

export function validateUrl(platformKey, url) {
  const p = platformFor(platformKey);
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) return { ok: false, message: 'Enter the full public link, starting with https://' };
  if (value.length > 500) return { ok: false, message: 'That link is too long.' };
  // Block anything that is not a public web URL — no internal hosts, no files.
  let parsed;
  try { parsed = new URL(value); } catch { return { ok: false, message: 'That does not look like a valid link.' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { ok: false, message: 'Only http and https links are accepted.' };
  const host = parsed.hostname.toLowerCase();
  // SSRF guard: a verification URL is fetched by the server, so it must never
  // be able to point at RazeKit's own network.
  if (
    host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')
    || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes('metadata')
  ) {
    return { ok: false, message: 'That link is not a public social media URL.' };
  }
  if (p && p.urlPattern && !p.urlPattern.test(value)) {
    return { ok: false, message: `That link does not look like a ${p.label} URL.` };
  }
  return { ok: true, url: value };
}

/**
 * Look for the challenge code on a public page.
 *
 * Returns an explicit outcome rather than a boolean, because "I could not
 * check" and "I checked and it was not there" must never be conflated — one
 * sends the creator to a person, the other tells them to fix something.
 */
export async function checkPublicEvidence(platformKey, url, code) {
  const p = platformFor(platformKey);
  if (!p) return { outcome: 'NOT_SUPPORTED', reason: 'Unknown platform.' };
  if (!p.autoCheck) {
    return {
      outcome: 'MANUAL_REVIEW',
      reason: `RazeKit cannot read ${p.label} pages automatically, so a person checks this one.`,
    };
  }

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        // Identify honestly. Nothing here pretends to be a browser to evade a
        // platform's terms.
        'User-Agent': 'RazeKit-Verification/1.0 (+https://razekit.com)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return { outcome: 'MANUAL_REVIEW', reason: `The page responded ${res.status}; a person will check it.` };
    }
    const html = (await res.text()).slice(0, 2_000_000);
    // Compare case-insensitively and ignore any HTML entity encoding of the
    // hyphen, which some platforms apply to captions.
    const haystack = html.toUpperCase().replace(/&#45;|&ndash;|&mdash;/g, '-');
    const found = haystack.includes(String(code).toUpperCase());
    return found
      ? { outcome: 'VERIFIED', reason: 'Verification code found on the public page.', evidence: `Found ${code} at ${url}` }
      : { outcome: 'FAILED', reason: 'The verification code was not found on that page. Make sure it is public and saved.' };
  } catch (e) {
    // A network failure is not a failed verification. Send it to a person.
    return { outcome: 'MANUAL_REVIEW', reason: `The page could not be reached automatically (${String(e?.message || e).split('\n')[0]}); a person will check it.` };
  }
}
