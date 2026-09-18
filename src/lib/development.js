import { useEffect, useState } from 'react';
import { development } from '@/lib/api';
import { DEV_AREA_VISIBLE } from '@/lib/flags';

// Whether the Development area is usable for this deployment.
//
// Two separate questions, and both must be yes. DEV_AREA_VISIBLE is the product
// decision — should this exist for users at all. The probe below is the
// operational one — is an engine actually wired up behind it. The probe answer
// is a property of the deployment rather than of the page, so it is fetched
// once per session and shared.

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
  const [enabled, setEnabled] = useState(DEV_AREA_VISIBLE ? cached : false);

  useEffect(() => {
    // When the area is switched off there is nothing to ask about, and asking
    // anyway would put a request for a hidden feature in the network log of
    // every page load.
    if (!DEV_AREA_VISIBLE) return undefined;

    let active = true;
    const listener = (value) => { if (active) setEnabled(value); };
    listeners.add(listener);
    load();
    return () => { active = false; listeners.delete(listener); };
  }, []);

  return DEV_AREA_VISIBLE && enabled === true;
}
