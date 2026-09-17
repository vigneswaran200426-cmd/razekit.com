// First-visit cookie notice.
//
// What it says depends on what is actually true. RazeKit currently stores only
// strictly necessary things — see src/lib/consent.js for the audited inventory —
// so this is a notice with an acknowledgement, not a consent gate with an
// Accept and a Reject that both do the same nothing.
//
// The moment an optional category is declared, this becomes a real choice:
// Reject and Accept appear, and hasConsent() decides whether that category's
// code runs. The switch is `hasOptionalStorage()`, so the two can never fall
// out of step with each other.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  acceptAll, hasOptionalStorage, onConsentChange, readConsent, rejectOptional, setConsent,
} from '@/lib/consent';

export default function CookieNotice() {
  // Undefined until mounted: reading localStorage during the first render would
  // flash the banner for people who already answered.
  const [decided, setDecided] = useState(undefined);

  useEffect(() => {
    setDecided(Boolean(readConsent()));
    return onConsentChange((c) => setDecided(Boolean(c)));
  }, []);

  if (decided === undefined || decided) return null;

  const optional = hasOptionalStorage();

  return (
    <div
      // A notice, not a modal: it must not trap focus or block the page. It is
      // announced politely rather than assertively so it does not interrupt a
      // screen reader mid-sentence on arrival.
      role="region"
      aria-label="Cookies on RazeKit"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85 motion-safe:animate-slide-in-bottom"
    >
      <div className="shell flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 gap-3">
          <Cookie className="mt-0.5 hidden h-5 w-5 shrink-0 text-primary sm:block" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Cookies on RazeKit</p>
            <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-muted">
              {optional ? (
                <>
                  We use essential cookies to keep RazeKit working, and optional ones to understand
                  how the site is used. You choose the optional ones.
                </>
              ) : (
                <>
                  RazeKit uses only what it needs to work — your sign-in session, an autosaved
                  contest draft, and this choice. There is no analytics and no third-party tracking
                  on this site.
                </>
              )}{' '}
              <Link
                to="/cookies"
                className="rounded font-medium text-primary-ink underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {optional ? 'Manage preferences' : 'See exactly what is stored'}
              </Link>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {optional ? (
            <>
              {/* Equal weight on purpose. A greyed-out Reject beside a bright
                  Accept is a dark pattern, and the choice has to be a real one. */}
              <Button variant="secondary" onClick={rejectOptional} className="flex-1 sm:flex-none">
                Reject
              </Button>
              <Button onClick={acceptAll} className="flex-1 sm:flex-none">Accept</Button>
            </>
          ) : (
            <Button onClick={() => setConsent([])} className="flex-1 sm:flex-none">Got it</Button>
          )}
        </div>
      </div>
    </div>
  );
}
