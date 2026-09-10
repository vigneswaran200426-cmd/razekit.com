// Additional UI primitives.
//
// Kept beside ui.jsx rather than inside it so the original surface stays
// stable, and re-exported from ui.jsx so every screen still imports from one
// place. These exist for the patterns the redesigned screens actually need:
// a detail view that works on a phone, a number that can honestly be absent,
// a score that explains itself, and a progression a user can read at a glance.
import { useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ── Sheet ──────────────────────────────────────────────────────────────────
   A bottom sheet on mobile, a side panel on desktop.

   This exists because a dense comparison view is genuinely useful on a wide
   screen and genuinely unusable on a phone. Rather than shrink the table, the
   detail moves into a sheet that enters from the edge it belongs to, so its
   origin is legible. Escape closes it, the backdrop closes it, the page behind
   stops scrolling, and focus moves into it on open.                         */
export function Sheet({ open, onClose, title, description, children, footer, side = 'bottom' }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title || 'Details'}>
      <button
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          'relative bg-surface shadow-lg focus:outline-none',
          // Mobile: a bottom sheet that never takes more room than it needs,
          // with clearance for the home indicator.
          'mt-auto w-full max-h-[88vh] rounded-t-xl animate-slide-in-bottom pb-[env(safe-area-inset-bottom)]',
          side === 'right'
            ? 'sm:mt-0 sm:ml-auto sm:h-full sm:max-h-none sm:w-[min(28rem,100%)] sm:rounded-none sm:rounded-l-xl sm:animate-slide-in-right'
            : 'sm:m-auto sm:max-w-lg sm:rounded-xl sm:animate-scale-in'
        )}
      >
        {/* Grab affordance, mobile only — it signals the sheet is dismissible. */}
        <div className="sm:hidden flex justify-center pt-2.5" aria-hidden="true">
          <span className="h-1 w-9 rounded-full bg-line-strong" />
        </div>

        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
            <div className="min-w-0">
              {title && <h2 className="font-display text-base font-bold text-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="max-h-[calc(88vh-8rem)] overflow-y-auto px-5 py-4 sm:max-h-[calc(100vh-9rem)]">{children}</div>

        {footer && <div className="border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Metric ─────────────────────────────────────────────────────────────────
   One number with its label, and an explicit empty state.

   `value` of null means NOT MEASURED, and is rendered as such rather than as a
   zero. A zero is a measurement; an absence is not. Showing one as the other
   is how a report ends up claiming something false — "this campaign earned
   nothing" instead of "we do not measure that".                             */
export function Metric({ label, value, unit, hint, empty = 'Not measured', tone = 'default', className }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-display font-extrabold leading-none nums tabular-nums',
          missing ? 'text-[15px] text-muted/70' : 'text-2xl',
          !missing && tone === 'success' && 'text-success',
          !missing && tone === 'danger' && 'text-danger',
          !missing && tone === 'default' && 'text-ink'
        )}
      >
        {missing ? empty : value}
        {!missing && unit && <span className="ml-0.5 text-sm font-bold text-muted">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/* ── ScoreBar ───────────────────────────────────────────────────────────────
   One 0-100 dimension as a bar.

   A null score renders as an explicit absence with its reason, not as an empty
   bar — an empty bar reads as zero, which is a different claim.             */
export function ScoreBar({ label, score, weight, tone = 'primary', reason }) {
  const missing = score === null || score === undefined;
  const value = Math.max(0, Math.min(100, Number(score)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-ink">{label}</span>
        <span className="nums text-[13px] font-semibold tabular-nums text-ink">
          {missing ? <span className="font-normal text-muted">Not measured</span> : value}
          {weight != null && !missing && (
            <span className="ml-1.5 text-[11px] font-normal text-muted">{weight}%</span>
          )}
        </span>
      </div>
      {missing ? (
        reason && <p className="mt-1 text-[11px] leading-snug text-muted">{reason}</p>
      ) : (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn(
              'rk-bar h-full rounded-full',
              tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-primary'
            )}
            style={{ width: `${value}%` }}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
          />
        </div>
      )}
    </div>
  );
}

/* ── Timeline ───────────────────────────────────────────────────────────────
   A vertical progression with done / current / failed / pending states.
   Status is never carried by colour alone — each state has its own mark and a
   screen-reader label.                                                      */
export function Timeline({ steps }) {
  const items = (steps || []).filter(Boolean);
  return (
    <ol className="space-y-0">
      {items.map((s, i) => {
        const last = i === items.length - 1;
        const state = s.failed ? 'failed' : s.done ? 'done' : s.current ? 'current' : 'pending';
        return (
          <li key={s.key || i} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && (
              <span
                aria-hidden="true"
                className={cn('absolute bottom-0 left-[11px] top-6 w-px', state === 'done' ? 'bg-success/40' : 'bg-line')}
              />
            )}
            <span
              className={cn(
                'relative z-10 mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 bg-surface',
                state === 'done' && 'border-success text-success',
                state === 'failed' && 'border-danger text-danger',
                state === 'current' && 'border-primary text-primary',
                state === 'pending' && 'border-line-strong text-muted'
              )}
            >
              {state === 'done' && <Check className="h-3 w-3" aria-hidden="true" />}
              {state === 'failed' && <X className="h-3 w-3" aria-hidden="true" />}
              {state === 'current' && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1 pt-px">
              <p className={cn('text-[13px] font-medium', state === 'pending' ? 'text-muted' : 'text-ink')}>{s.label}</p>
              {s.detail && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{s.detail}</p>}
              {s.at && <p className="mt-0.5 text-[11px] text-muted">{s.at}</p>}
            </div>
            <span className="sr-only">{state}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Field ──────────────────────────────────────────────────────────────────
   A labelled control with its error attached to it, rather than floating at
   the top of a form where the user has to work out which field it belongs to. */
export function Field({ id, label, hint, error, required, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[12px] text-danger">{error}</p>
      ) : (
        hint && <p className="mt-1 text-[12px] leading-snug text-muted">{hint}</p>
      )}
    </div>
  );
}
