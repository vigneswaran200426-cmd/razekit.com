import { Play, Trophy, BadgeCheck } from 'lucide-react';
import { formatPrize } from '@/lib/utils';
import { placementLabel } from '@/lib/winner-publish';

// Exact public Winners Hub preview — how the entry will appear once published.
export default function WinnerHubPreview({ draft, creator, client, isVideo }) {
  const creatorName = creator?.display_name || creator?.username || 'You';
  const clientName = client?.company_name || client?.display_name || client?.username || 'Brand';
  const poster = draft.thumbnail_uri || draft.thumbnail_url || null;
  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-fade-in">
      <div className="relative aspect-video bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 overflow-hidden">
        {draft.media_uri && draft.media_type === 'image' ? (
          <img src={draft.media_uri} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : poster ? (
          <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : null}
        {isVideo && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-md"><Play className="w-5 h-5 text-primary fill-primary ml-0.5" /></span>
          </span>
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-foreground/70 backdrop-blur text-white font-semibold">
          <Trophy className="w-3 h-3" /> {placementLabel(draft.placement || 1)}
        </span>
      </div>
      <div className="p-4">
        <span className="text-[11px] text-primary font-medium">{draft.category || 'Creative'}</span>
        <h3 className="font-heading font-semibold text-[15px] leading-snug line-clamp-1 mt-0.5">{draft.title || 'Untitled work'}</h3>
        <p className="text-xs text-muted-foreground truncate">Brand: {clientName}</p>
        {draft.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{draft.description}</p>}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60 gap-2">
          <span className="flex items-center gap-2 min-w-0">
            {creator?.avatar_url
              ? <img src={creator.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
              : <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{creatorName[0]?.toUpperCase()}</span>}
            <span className="text-xs font-medium truncate inline-flex items-center gap-0.5">{creatorName}{creator && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}</span>
          </span>
          <span className="font-heading text-sm font-bold text-primary shrink-0">{formatPrize(draft.prize_amount, draft.currency)}</span>
        </div>
      </div>
    </div>
  );
}