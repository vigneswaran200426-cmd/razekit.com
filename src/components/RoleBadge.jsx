import { Briefcase, Video, Compass } from 'lucide-react';

// RoleBadge — subtle account-mode indicator.
// CLIENT = amber · CREATOR = Action blue · VISITOR = muted
export default function RoleBadge({ role, size = 'sm' }) {
  const isClient  = role === 'client';
  const isCreator = role === 'creator';
  const Icon  = isClient ? Briefcase : isCreator ? Video : Compass;
  const label = isClient ? 'BRAND' : isCreator ? 'CREATOR' : 'VISITOR';
  const sizes = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span className={`inline-flex items-center rounded-full font-semibold tracking-wide ${sizes[size]}
      ${isClient  ? 'bg-[#D78C05]/12 text-[#D78C05]'  :
        isCreator ? 'bg-[#1A7BF8]/10 text-[#1A7BF8]'  :
                    'bg-[#5F7597]/10 text-[#5F7597]'}`}>
      <Icon className={iconSize} />
      {label}
    </span>
  );
}