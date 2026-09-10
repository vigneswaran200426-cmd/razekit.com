import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ── Button ─────────────────────────────────────────────────────────────── */
const BTN = {
  base: 'inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-all duration-150 ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] whitespace-nowrap',
  variant: {
    primary: 'bg-primary text-white shadow-glow hover:bg-primary-ink',
    secondary: 'bg-surface text-ink border border-line-strong hover:border-primary/50 hover:bg-surface-2',
    ghost: 'text-muted hover:text-ink hover:bg-surface-2',
    danger: 'bg-danger text-white hover:brightness-95',
    outlineDanger: 'border border-danger/40 text-danger hover:bg-danger/5',
  },
  size: { sm: 'h-9 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' },
};

export const Button = forwardRef(function Button(
  { as, to, href, variant = 'primary', size = 'md', loading, className, children, ...props }, ref
) {
  const cls = cn(BTN.base, BTN.variant[variant], BTN.size[size], className);
  const inner = <>{loading && <Loader2 className="w-4 h-4 animate-spin" />}{children}</>;
  if (to) return <Link ref={ref} to={to} className={cls} {...props}>{inner}</Link>;
  if (href) return <a ref={ref} href={href} className={cls} {...props}>{inner}</a>;
  const Comp = as || 'button';
  return <Comp ref={ref} className={cls} disabled={loading || props.disabled} {...props}>{inner}</Comp>;
});

/* ── Card / panel ───────────────────────────────────────────────────────── */
export function Card({ className, hover, as: Comp = 'div', ...props }) {
  return <Comp className={cn('bg-surface border border-line rounded-lg shadow-xs', hover && 'transition-all duration-200 ease-brand hover:shadow-md hover:border-line-strong', className)} {...props} />;
}

/* ── Input / Label ──────────────────────────────────────────────────────── */
export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn('h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/70 transition-colors focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20', className)} {...props} />;
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
            className={cn('rounded-[7px] font-semibold transition-all ease-brand', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]',
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
