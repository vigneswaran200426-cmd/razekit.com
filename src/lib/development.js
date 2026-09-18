import { useEffect, useState } from 'react';
import { development } from '@/lib/api';

// Whether the Development area is switched on for this deployment.
//
// The answer is a property of the deployment, not of the page, so it is fetched
// once per session and shared. Without this the navigation would either show a
// section that leads to "not configured", or hide a section that works — and
// the check would run again on every route change.

/**
 * Whether a rejection is just a request the caller abandoned.
 *
 * The API client reports an abandoned request as a NetworkError with code
 * ABORTED — not as a DOMException named AbortError. Checking for the latter
 * matches nothing, so leaving a page (or React's development double-effect)
 * would put "Request cancelled" on screen as though something had failed.
 */
export function isAbandonedRequest(error) {
  return error?.code === 'ABORTED' || error?.name === 'AbortError';
}

let cached = null;
let inFlight = null;
const listeners = new Set();

function resolve(value) {
  cached = value;
  inFlight = null;
  listeners.forEach((fn) => fn(value));
}

function load() {
  if (cached !== null) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = development
      .status()
      .then((r) => resolve(Boolean(r?.configured)))
      // A failed probe means "do not offer it", never a broken navigation bar.
      .catch(() => resolve(false));
  }
  return inFlight;
}

export function useDevelopmentEnabled() {
  const [enabled, setEnabled] = useState(cached);

  useEffect(() => {
    let active = true;
    const listener = (value) => { if (active) setEnabled(value); };
    listeners.add(listener);
    load();
    return () => { active = false; listeners.delete(listener); };
  }, []);

  return enabled === true;
}
