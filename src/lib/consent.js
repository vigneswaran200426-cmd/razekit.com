// What RazeKit stores in your browser, and who decides.
//
// The inventory below was produced by auditing the source, not by assuming:
// there is currently **no analytics, no tracking pixel and no third-party
// script** anywhere in this application. Everything stored is strictly
// necessary — the session token, an autosaved contest draft so a half-written
// brief survives a refresh, and which page of the Help guide you were reading.
//
// So this module is deliberately in an honest state. The gating machinery is
// real and enforced, and OPTIONAL_CATEGORIES is empty because nothing optional
// is in use. A banner offering "Accept / Reject analytics" today would be a
// control wired to nothing, and a consent dialog that does not change behaviour
// is worse than no dialog: it trains people that the choice is theatre.
//
// When something optional is genuinely added, it declares a category here and
// calls hasConsent() before it runs. The banner and the settings page pick it
// up with no further work, and everyone who already answered is asked again
// because CONSENT_VERSION moves.

const KEY = 'rk_consent';

/** Bump when the categories materially change, so consent is asked again. */
export const CONSENT_VERSION = 1;

/**
 * Storage RazeKit cannot work without. Not consentable, and deliberately
 * listed anyway — "essential" is a claim, and a claim should be checkable.
 */
export const ESSENTIAL_STORAGE = [
  {
    key: 'rk_token',
    name: 'Sign-in session',
    purpose: 'Keeps you signed in between page loads. Cleared when you sign out.',
  },
  {
    key: 'rk:create-contest:<your account id>',
    name: 'Contest draft',
    purpose: 'Autosaves a brief you are still writing so a refresh or a dropped connection does not lose it.',
  },
  {
    key: 'rk_guide_page',
    name: 'Help guide position',
    purpose: 'Remembers which page of the Help guide you had open.',
  },
  {
    key: KEY,
    name: 'Cookie choice',
    purpose: 'Records this decision, so you are not asked on every page.',
  },
];

/**
 * Consentable categories. Empty on purpose — see the note at the top.
 * Shape, for when one is added:
 *   { id: 'analytics', name: 'Analytics', purpose: '…', keys: ['…'] }
 */
export const OPTIONAL_CATEGORIES = [];

/** True when there is actually a choice to offer. */
export const hasOptionalStorage = () => OPTIONAL_CATEGORIES.length > 0;

const listeners = new Set();

/** The stored decision, or null if none was made under the current version. */
export function readConsent() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    // A decision made against a different set of categories is not a decision
    // about this one.
    if (!v || v.version !== CONSENT_VERSION) return null;
    return v;
  } catch {
    // Private mode, disabled storage, corrupt value. Treated as "not asked",
    // which is the conservative reading: nothing optional runs.
    return null;
  }
}

function write(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Consent that cannot be persisted still applies for this page view; it
    // simply gets asked again. Never let this throw into a render.
  }
  listeners.forEach((fn) => {
    try { fn(next); } catch { /* a bad listener must not break the others */ }
  });
}

/**
 * Record a decision.
 * `granted` is the list of optional category ids the person allowed.
 */
export function setConsent(granted) {
  const allowed = OPTIONAL_CATEGORIES.map((c) => c.id).filter((id) => granted.includes(id));
  write({
    version: CONSENT_VERSION,
    granted: allowed,
    // Which categories existed when the choice was made, so a later audit can
    // tell "declined analytics" from "analytics did not exist yet".
    offered: OPTIONAL_CATEGORIES.map((c) => c.id),
    at: new Date().toISOString(),
  });
}

export const acceptAll = () => setConsent(OPTIONAL_CATEGORIES.map((c) => c.id));
export const rejectOptional = () => setConsent([]);

/**
 * The gate. Anything non-essential must pass through here before it runs.
 *
 * Essential storage does not call this and must not: gating the session token
 * on a cookie banner would mean rejecting cookies signs you out, which is not a
 * choice anyone is actually offering.
 */
export function hasConsent(categoryId) {
  const c = readConsent();
  return Boolean(c && c.granted.includes(categoryId));
}

/** Subscribe to changes, so the banner and the settings page stay in step. */
export function onConsentChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Forget the decision — used by "Ask me again" on the settings page. */
export function clearConsent() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  listeners.forEach((fn) => {
    try { fn(null); } catch { /* as above */ }
  });
}
