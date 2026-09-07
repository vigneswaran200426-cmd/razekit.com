import { Share2 } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import PlatformIcon from '@/components/social/PlatformIcon';
import { PUBLISHED_LIKE } from '@/lib/social-tracker';

// Creator social summary (§19): only the creator's own published content,
// counted from real social campaign post records.
export default function SocialSummaryCard({ posts = [] }) {
  const byPlatform = new Map();
  posts.forEach((p) => {
    const entry = byPlatform.get(p.platform) || { platform: p.platform, published: 0, pending: 0 };
    if (PUBLISHED_LIKE.includes(p.status)) entry.published += 1; else entry.pending += 1;
    byPlatform.set(p.platform, entry);
  });
  const rows = [...byPlatform.values()];

  return (
    <GlassCard className="p-5">
      <p className="font-heading font-semibold text-sm mb-2.5">Social Tracker</p>
      {rows.length ? (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.platform} className="flex items-center gap-2.5 text-sm">
              <span className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center shrink-0"><PlatformIcon platform={r.platform} className="w-3.5 h-3.5" /></span>
              <span className="font-medium capitalize">{r.platform}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {r.published} published{r.pending ? ` · ${r.pending} pending` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Share2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          When a brand publishes your winning content, it appears here per platform.
        </p>
      )}
    </GlassCard>
  );
}