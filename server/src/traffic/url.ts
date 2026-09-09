// @ts-nocheck
// Destination URL validation for tracking links.
//
// The redirect endpoint sends real visitors to a stored URL, so that URL is a
// security boundary: an attacker who controls it gets an open redirect (phishing
// from a razekit.com link) and can probe our network (SSRF) if we ever fetch it.
// Validation happens ONCE at link-creation time; the click path only replays a
// value that already passed here.

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Hosts that must never be a public campaign destination.
const BLOCKED_HOSTNAMES = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal',
  'instance-data', 'metadata',
]);

function isPrivateIPv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, Number(m[2]), Number(m[3]), Number(m[4])].some((n) => n > 255)) return true; // malformed → reject
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a >= 224) return true;               // multicast / reserved
  return false;
}

/**
 * Validate a brand campaign destination.
 * Returns { ok:true, url } with a normalized absolute URL, or { ok:false, message }.
 */
export function validateDestinationUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return { ok: false, message: 'A campaign destination URL is required.' };
  if (value.length > 2048) return { ok: false, message: 'That destination URL is too long.' };

  let u;
  try { u = new URL(value); } catch { return { ok: false, message: 'Enter a valid URL (including https://).' }; }

  if (!ALLOWED_PROTOCOLS.has(u.protocol)) {
    return { ok: false, message: 'Only http:// and https:// destinations are allowed.' };
  }
  if (u.username || u.password) {
    return { ok: false, message: 'Destination URLs must not contain credentials.' };
  }

  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return { ok: false, message: 'That destination is not publicly reachable.' };
  }
  if (isPrivateIPv4(host)) {
    return { ok: false, message: 'That destination is not publicly reachable.' };
  }
  // Bare IPv6 / unbracketed forms and hosts without a dot are not real public sites.
  if (host.includes(':') || !host.includes('.')) {
    return { ok: false, message: 'Enter a public website address.' };
  }

  return { ok: true, url: u.toString() };
}
