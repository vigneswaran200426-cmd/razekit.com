import { Link } from 'react-router-dom';
import { Info, AlertTriangle, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
  Razekit AlertBanner — compact inline alert for forms, panels and workflow steps.
  Same state language as AlertState, no heavy animation: small icon, short copy,
  optional action. Color is never the only indicator — every tone carries an icon.
*/

const TONES = {
  info:    { icon: Info,          surface: 'bg-primary/5 border-primary/20',   iconCls: 'text-primary' },
  warning:{ icon: AlertTriangle, surface: 'bg-[#FFF9E6] border-[#D78C05]/25', iconCls: 'text-[#D78C05]' },
  error:  { icon: AlertCircle,   surface: 'bg-destructive/5 border-destructive/25', iconCls: 'text-destructive' },
  success:{ icon: CheckCircle2,  surface: 'bg-success/5 border-success/25',    iconCls: 'text-success' },
};

export default function AlertBanner({ tone = 'info', title, description, actionLabel, onAction, to, className }) {
  const t = TONES[tone] || TONES.info;
  const Icon = t.icon;

  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3', t.surface, className)}>
      <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', t.iconCls)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {description && <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>}
      </div>
      {actionLabel && (to || onAction) && (
        to ? (
          <Link to={to} className="inline-flex items-center gap-0.5 shrink-0 text-xs font-semibold text-primary hover:underline">
            {actionLabel} <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <button type="button" onClick={onAction} className="inline-flex items-center gap-0.5 shrink-0 text-xs font-semibold text-primary hover:underline">
            {actionLabel} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )
      )}
    </div>
  );
}