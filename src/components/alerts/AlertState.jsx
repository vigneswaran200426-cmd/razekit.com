import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import AlertShape from './AlertShape';
import { ALERT_STATES } from '@/lib/alert-states';

/*
  Razekit AlertState — the single reusable empty / error / success / warning /
  processing / expired / locked state card. One visual, one title, one sentence,
  one action. The animated shape communicates state; the card and text stay still.
  Pass `state` (registry key) for standard copy, or override with props.
*/

// Each state has a motion personality and a soft pastel preset.
const TYPE_STYLES = {
  empty:          { preset: 'emptyBlue',      motion: 'float',      btn: 'primary' },
  loading:        { preset: 'processingBlue', motion: 'pulse',      btn: 'primary' },
  processing:     { preset: 'processingBlue', motion: 'orbit',      btn: 'primary' },
  success:        { preset: 'successGreen',   motion: 'rise',       btn: 'success' },
  completed:      { preset: 'successGreen',   motion: 'float',     btn: 'success' },
  warning:        { preset: 'warningAmber',   motion: 'breathe',    btn: 'warning' },
  'action-required': { preset: 'warningAmber', motion: 'breathe',  btn: 'warning' },
  error:          { preset: 'errorCoral',    motion: 'oscillate',  btn: 'destructive' },
  expired:        { preset: 'warningAmber',   motion: 'rotate',     btn: 'warning' },
  info:           { preset: 'infoBlue',       motion: 'drift',      btn: 'primary' },
  locked:         { preset: 'neutralGray',    motion: 'breathe',    btn: 'secondary' },
  'not-found':     { preset: 'emptyLavender',  motion: 'float',      btn: 'primary' },
  offline:         { preset: 'neutralGray',    motion: 'oscillate',  btn: 'primary' },
  'coming-soon':   { preset: 'emptyLavender',  motion: 'drift',      btn: 'primary' },
};

const BTN_CLASSES = {
  primary: 'bg-primary text-primary-foreground hover:bg-[#0B48E8]',
  success: 'bg-success text-success-foreground hover:opacity-90',
  warning: 'bg-warning text-warning-foreground hover:opacity-90',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
};

const SIZES = { sm: 56, default: 72, lg: 88 };

export default function AlertState({
  type = 'empty',
  state,               // registry key from @/lib/alert-states — copy defaults
  shape,               // override the visual primitive
  title,
  description,
  action,              // { label, to?, onClick? }
  secondaryAction,     // { label, to?, onClick? }
  size = 'default',
  compact = false,
  animated = true,
  className,
}) {
  const reg = state ? (ALERT_STATES[state] || {}) : {};
  const resolvedType = type || reg.type || 'empty';
  const t = TYPE_STYLES[resolvedType] || TYPE_STYLES.empty;
  const visual = shape || reg.shape || 'blob';
  const mainTitle = title ?? reg.title;
  const desc = description ?? reg.description;
  const mainAction = action || (reg.actionLabel ? { label: reg.actionLabel } : null);

  const isAlert = ['error', 'expired', 'offline'].includes(resolvedType);
  const shapeSize = compact ? SIZES.sm * 0.75 : SIZES[size] || SIZES.default;

  const renderAction = (a, primary) => {
    if (!a) return null;
    const cls = primary
      ? `inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-all hover:-translate-y-px active:scale-[0.98] ${BTN_CLASSES[t.btn]}`
      : 'text-sm font-semibold text-primary underline-offset-4 hover:underline';
    const inner = (
      <>
        {a.label}
        {primary && <ArrowRight className="w-4 h-4" />}
      </>
    );
    return a.to ? (
      <Link to={a.to} className={cls}>{inner}</Link>
    ) : (
      <button type="button" onClick={a.onClick} className={cls}>{inner}</button>
    );
  };

  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      className={cn(
        'glass-card rounded-3xl text-center max-w-md mx-auto',
        compact ? 'p-5 max-w-none mx-0 text-left' : 'p-8',
        className
      )}
    >
      <div className={cn('flex', compact ? 'items-center gap-4' : 'flex-col items-center')}>
        <AlertShape preset={t.preset} shape={visual} motion={t.motion} size={shapeSize} animated={animated} />
        <div className={compact ? 'min-w-0' : 'mt-5 w-full'}>
          {mainTitle && <p className="font-heading font-semibold text-base mb-1">{mainTitle}</p>}
          {desc && <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>}
          {(mainAction || secondaryAction) && (
            <div className={cn('flex flex-wrap items-center gap-3', compact ? 'mt-1.5' : 'mt-5 justify-center')}>
              {renderAction(mainAction, true)}
              {renderAction(secondaryAction, false)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}