// Cookie settings — public, no sign-in required.
//
// The point of this page is that the claim on the banner is checkable. Every
// key RazeKit writes to your browser is listed with what it is for, and the
// list is generated from the same module the app gates behaviour on, so it
// cannot describe one thing while the code does another.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Cookie, ShieldCheck } from 'lucide-react';
import { Button, Card, PageHeader, Switch } from '@/components/ui';
import {
  CONSENT_VERSION, ESSENTIAL_STORAGE, OPTIONAL_CATEGORIES, acceptAll, clearConsent,
  hasOptionalStorage, onConsentChange, readConsent, rejectOptional, setConsent,
} from '@/lib/consent';

export default function Cookies() {
  const [consent, setLocal] = useState(() => null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocal(readConsent());
    setReady(true);
    return onConsentChange(setLocal);
  }, []);

  const optional = hasOptionalStorage();
  const granted = consent?.granted || [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Title and description live in ROUTE_SEO with every other public route,
          so a search result and the page cannot describe different things. */}
      <PageHeader
        title="Cookie settings"
        description="Everything RazeKit stores in your browser, and what each item is for."
      />

      {/* The honest headline. If this ever stops being true, OPTIONAL_CATEGORIES
          stops being empty and this whole block changes with it. */}
      {!optional && (
        <Card className="flex gap-3 border-success/30 bg-success/[0.05] p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">No tracking on this site</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              RazeKit runs no analytics, no advertising pixels and no third-party scripts. There is
              nothing optional to turn off, so there is nothing here asking you to. The list below is
              everything, and all of it is needed for the site to work.
            </p>
          </div>
        </Card>
      )}

      <section aria-labelledby="essential-heading">
        <h2 id="essential-heading" className="font-display text-base font-bold text-ink">
          Essential
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Required for signing in, for security, and for not losing work you are part-way through.
          These cannot be switched off without breaking the site — so they are listed rather than
          offered as a choice.
        </p>
        <Card className="mt-3 overflow-hidden p-0">
          <ul className="divide-y divide-line">
            {ESSENTIAL_STORAGE.map((s) => (
              <li key={s.key} className="px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold text-ink">{s.name}</p>
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{s.key}</code>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.purpose}</p>
              </li>
            ))}
          </ul>
        </Card>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          All of these are stored by your browser on this device only. None of them is shared with a
          third party.
        </p>
      </section>

      {optional && (
        <section aria-labelledby="optional-heading">
          <h2 id="optional-heading" className="font-display text-base font-bold text-ink">Optional</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Off unless you turn them on. RazeKit works exactly the same either way.
          </p>
          <Card className="mt-3 p-4">
            {OPTIONAL_CATEGORIES.map((c) => (
              <Switch
                key={c.id}
                id={`consent-${c.id}`}
                label={c.name}
                description={c.purpose}
                checked={granted.includes(c.id)}
                onChange={(on) => setConsent(
                  on ? [...granted, c.id] : granted.filter((g) => g !== c.id),
                )}
              />
            ))}
          </Card>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={rejectOptional}>Reject all optional</Button>
            <Button onClick={acceptAll}>Accept all optional</Button>
          </div>
        </section>
      )}

      <section aria-labelledby="choice-heading" className="border-t border-line pt-5">
        <h2 id="choice-heading" className="font-display text-base font-bold text-ink">Your choice</h2>
        {!ready ? (
          <p className="mt-1 text-[13px] text-muted">Checking…</p>
        ) : consent ? (
          <>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
              <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              Recorded on{' '}
              <time dateTime={consent.at}>
                {new Date(consent.at).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </time>
              <span aria-hidden="true">·</span>
              <span className="nums">version {consent.version}</span>
            </p>
            <Button variant="secondary" className="mt-3" onClick={clearConsent}>
              <Cookie className="h-4 w-4" aria-hidden="true" /> Ask me again
            </Button>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-muted">
            You have not made a choice on this device yet.
          </p>
        )}
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          If what RazeKit stores changes in a way that needs a fresh decision, the version moves past{' '}
          <span className="nums">{CONSENT_VERSION}</span> and you will be asked again rather than
          having an old answer applied to a new question.
        </p>
      </section>

      <p className="text-[13px] text-muted">
        See also our <Link to="/privacy" className="rounded font-medium text-primary-ink underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Privacy Policy</Link>{' '}
        and <Link to="/terms" className="rounded font-medium text-primary-ink underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Terms</Link>.
      </p>
    </div>
  );
}
