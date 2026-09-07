import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';

// Razekit premium page header — optional eyebrow + title + subtitle on the left,
// optional action cluster on the right. Consistent rhythm across every screen (spec §68).
export default function PageHeader({ eyebrow, title, subtitle, actions, backTo, backLabel = 'Back', icon: Icon, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}
    >
      <div className="min-w-0">
        {backTo && (
          <Link to={backTo} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors mb-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
          </Link>
        )}
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/70 mb-1">{eyebrow}</p>
        )}
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </span>
          )}
          <h1 className="font-heading text-lg md:text-xl font-bold leading-tight tracking-tight truncate">{title}</h1>
        </div>
        {subtitle && <p className="text-sm text-muted-foreground mt-1.5 max-w-prose">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </motion.div>
  );
}

// Premium segmented pill tabs — one consistent control for every tabbed surface.
// `tabs` = array of { key, label, icon? } (or plain strings); `value` matches key (or index for strings).
export function SegmentedTabs({ tabs, value, onChange, size = 'default', className }) {
  const items = tabs.map((t, i) => (typeof t === 'string' ? { key: i, label: t } : t));
  const pad = size === 'sm' ? 'px-3 py-1' : 'px-3.5 py-1.5';
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-full bg-secondary/60 p-1 max-w-full overflow-x-auto scrollbar-hide', className)}>
      {items.map((t) => {
        const active = value === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ease-brand',
              pad,
              active ? 'bg-white text-primary shadow-[0_1px_3px_rgba(12,36,68,0.12)]' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />} {t.label}
          </button>
        );
      })}
    </div>
  );
}