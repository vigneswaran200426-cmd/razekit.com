import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ── Button ─────────────────────────────────────────────────────────────── */
const BTN = {
  // active:scale fires on pointer-DOWN, not on release. The moment feedback
  // waits for click, directness falls off a cliff — a button that highlights
  // only after you let go feels dead even when the handler is instant.
  //
  // Disabled is a muted FILL, not opacity. Fading the whole control also fades
  // its text, and unreadable disabled text is an accessibility failure rather
  // than a style: a user must still be able to read what they cannot press.
  base: 'inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-all duration-fast ease-brand '
    + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg '
    + 'active:scale-[0.98] active:duration-instant whitespace-nowrap '
    + 'disabled:pointer-events-none disabled:bg-surface-2 disabled:text-disabled disabled:border-line disabled:shadow-none',
  variant: {
    // Exactly one glowing control per view. A glow on three buttons stops
    // meaning "this is the thing to press".
    primary: 'bg-primary text-white shadow-glow hover:bg-primary-hover',
    secondary: 'bg-surface text-ink border border-line-strong hover:border-primary/50 hover:bg-surface-2',
    // Tertiary reads as a link but keeps a button's hit area and states.
    tertiary: 'text-primary hover:bg-primary-wash',
    ghost: 'text-muted hover:text-ink hover:bg-surface-2',
    danger: 'bg-danger text-white hover:brightness-95',
    outlineDanger: 'border border-danger/40 text-danger hover:bg-danger/5',
  },
  // Touch targets grow on a COARSE pointer only. A finger needs 44px (Apple HIG
  // and Material both say so); a mouse does not, and forcing 44px everywhere
  // would inflate every dense desktop toolbar to fix a problem desktop does not
  // have. sm and md are 36px and 40px on a mouse, 44px under a finger.
  size: {
    sm: 'h-9 px-3 text-[13px] [@media(pointer:coarse)]:h-11',
    md: 'h-10 px-4 text-sm [@media(pointer:coarse)]:h-11',
    lg: 'h-12 px-6 text-[15px]',
  },
};

export const Button = forwardRef(function Button(
  { as, to, href, variant = 'primary', size = 'md', loading, success, className, children, ...props }, ref
) {
  const cls = cn(BTN.base, BTN.variant[variant], BTN.size[size],
    // A confirmed action holds green briefly instead of snapping back to rest,
    // so the confirmation is legible rather than a flicker.
    success && 'bg-success text-white shadow-none hover:bg-success',
    className);
  const inner = (
    <>
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {success && !loading && <Check className="w-4 h-4" aria-hidden="true" />}
      {children}
    </>
  );
  if (to) return <Link ref={ref} to={to} className={cls} {...props}>{inner}</Link>;
  if (href) return <a ref={ref} href={href} className={cls} {...props}>{inner}</a>;
  const Comp = as || 'button';
  return <Comp ref={ref} className={cls} disabled={loading || props.disabled} {...props}>{inner}</Comp>;
});

/* ── Card / panel ───────────────────────────────────────────────────────── */
/**
 * A surface one level above the page.
 *
 * `hover` is for cards that are genuinely interactive — it lifts slightly to
 * say "this is pressable". A static card must NOT take it: movement that leads
 * nowhere teaches people to ignore movement that does.
 */
export function Card({ className, hover, as: Comp = 'div', ...props }) {
  return (
    <Comp
      className={cn(
        'bg-surface border border-line rounded-lg shadow-xs',
        hover && 'transition-all duration-base ease-brand hover:shadow-md hover:border-line-strong hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
        className,
      )}
      {...props}
    />
  );
}

/* ── Input / Label ──────────────────────────────────────────────────────── */
export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      // aria-invalid rather than colour alone: a red border is invisible to a
      // screen reader and to a good part of the sighted population too.
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 [@media(pointer:coarse)]:h-11 w-full rounded-md border bg-surface px-3 text-sm text-ink',
        'placeholder:text-subtle transition-colors duration-fast',
        'focus:outline-none focus:ring-2',
        invalid
          ? 'border-danger focus:border-danger focus:ring-danger/20'
          : 'border-line-strong focus:border-primary focus:ring-primary/20',
        'disabled:bg-surface-2 disabled:text-disabled disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
});
export function Label({ className, ...props }) {
  return <label className={cn('block text-[13px] font-medium text-ink mb-1.5', className)} {...props} />;
}

/* ── Badge / status pill ────────────────────────────────────────────────── */
const TONES = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/10 text-danger',
  ink: 'bg-ink text-white',
};
export function Badge({ tone = 'neutral', className, children }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', TONES[tone] || TONES.neutral, className)}>{children}</span>;
}

/* ── Spinner / Skeleton ─────────────────────────────────────────────────── */
export function Spinner({ className }) {
  return <Loader2 className={cn('w-5 h-5 animate-spin text-primary', className)} aria-label="Loading" role="status" />;
}
export function Skeleton({ className }) {
  return <div className={cn('relative overflow-hidden rounded-md bg-surface-2', className)}>
    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent animate-[shimmer_1.4s_infinite]" />
  </div>;
}

/* ── Page header ────────────────────────────────────────────────────────── */
export function PageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1.5">{eyebrow}</p>}
        <h1 className="font-display text-2xl sm:text-[28px] font-extrabold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-[15px] text-muted max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ── Segmented control ──────────────────────────────────────────────────── */
export function Segmented({ tabs, value, onChange, size = 'md' }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-surface-2 p-1 border border-line">
      {tabs.map((t) => {
        const key = t.key ?? t;
        const label = t.label ?? t;
        const active = value === key;
        return (
          <button key={key} onClick={() => onChange(key)}
            // Tabs were 32px tall. Under a finger they are 44px; a mouse keeps
            // the tighter density this control was designed for.
            className={cn('rounded-[7px] font-semibold transition-all ease-brand [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:px-4',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]',
              active ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink')}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Avatar ─────────────────────────────────────────────────────────────── */
export function Avatar({ name, src, size = 36, className }) {
  const ini = String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  if (src) return <img src={src} alt={name || ''} width={size} height={size} className={cn('rounded-full object-cover', className)} style={{ width: size, height: size }} />;
  return <span className={cn('inline-grid place-items-center rounded-full bg-ink text-white font-bold', className)} style={{ width: size, height: size, fontSize: size * 0.36 }}>{ini}</span>;
}

/* ── Empty state (compact) ──────────────────────────────────────────────── */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('rounded-lg border border-dashed border-line-strong bg-surface/60 py-10 px-6 text-center', className)}>
      {Icon && <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-md bg-surface-2 text-primary"><Icon className="h-5 w-5" /></div>}
      <h3 className="font-display text-base font-bold text-ink">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ── Stat tile ──────────────────────────────────────────────────────────── */
export function StatTile({ label, value, icon: Icon, className }) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-muted">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-muted/70" />}
      </div>
      <p className="mt-1.5 font-display text-2xl font-extrabold text-ink nums">{value}</p>
    </Card>
  );
}

/* Additional primitives live in primitives.jsx so this file stays a stable
   surface; re-exported here so every screen still imports from one place. */
export { Sheet, Metric, ScoreBar, Timeline, Field } from '@/components/primitives';
