import { cn } from '@/lib/utils';
import { SOCIAL_PLATFORMS } from '@/lib/social-platforms';
import { PUBLISHED_LIKE } from '@/lib/social-tracker';
import PlatformIcon from './PlatformIcon';

// Data-driven platform tabs (§34): only platforms that actually have posts,
// each showing its real published / pending counts.
export default function PlatformTabs({ posts = [], active, onChange }) {
  const ids = ['all', ...SOCIAL_PLATFORMS.map((p) => p.id).filter((id) => posts.some((p) => p.platform === id))];
  const counts = (id) => {
    const mine = posts.filter((p) => p.platform === id);
    return {
      published: mine.filter((p) => PUBLISHED_LIKE.includes(p.status)).length,
      pending: mine.filter((p) => !PUBLISHED_LIKE.includes(p.status) && !['REMOVED', 'ARCHIVED'].includes(p.status)).length,
    };
  };
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      {ids.map((id) => {
        const p = id === 'all' ? null : SOCIAL_PLATFORMS.find((x) => x.id === id);
        const c = counts(id);
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card border border-border/60 text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={isActive}
          >
            {p && <PlatformIcon platform={id} className={cn('w-3.5 h-3.5', isActive && 'text-white')} />}
            {p ? p.name : 'All'}
            <span className={cn('text-[11px] font-semibold', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/70')}>
              {c.published}p · {c.pending}act
            </span>
          </button>
        );
      })}
    </div>
  );
}