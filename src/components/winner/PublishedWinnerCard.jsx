import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Play, Trophy, BadgeCheck, ArrowRight } from 'lucide-react';
import { EASE } from '@/lib/motion';
import { formatPrize } from '@/lib/utils';
import { placementLabel } from '@/lib/winner-publish';
import { useWinnerPoster } from './WinnerMedia';

function Poster({ publish }) {
  const poster = useWinnerPoster(publish);
  return (
    <>
      {poster
        ? <img src={poster} alt={publish.title || 'Winning work'} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" loading="lazy" />
        : <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10" />}
    </>
  );
}

// Premium published-winner card. The media is the hero; stats stay off.
export default function PublishedWinnerCard({ publish, creator, client, index = 0, isVideo }) {
  const creatorName = creator?.display_name || creator?.username || `Creator #${publish.creator_id?.slice(-4)?.toUpperCase()}`;
  const clientName = client?.company_name || client?.display_name || client?.username || 'Brand';
  const video = isVideo ?? publish.media_type !== 'image';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: Math.min(index, 8) * 0.05 }}
      whileHover={{ y: -3 }}
      className="h-full"
    >
      <Link to={`/winner/${publish.id}`} className="flex flex-col glass-card rounded-2xl overflow-hidden h-full transition-shadow duration-200 hover:shadow-glass-lg group">
        <div className="relative aspect-video bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 overflow-hidden">
          <Poster publish={publish} />
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-foreground/70 backdrop-blur text-white font-semibold">
            <Trophy className="w-3 h-3" /> {placementLabel(publish.placement || 1)}
          </span>
          {video && (
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform"><Play className="w-5 h-5 text-primary fill-primary ml-0.5" /></span>
            </span>
          )}
        </div>
        <div className="p-4 flex flex-col flex-1">
          <span className="text-[11px] text-primary font-medium">{publish.category || 'Creative'}</span>
          <h3 className="font-heading font-semibold text-[15px] leading-snug line-clamp-1 mt-0.5">{publish.title}</h3>
          <p className="text-xs text-muted-foreground truncate">Brand: {clientName}</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60 gap-2">
            <span className="flex items-center gap-2 min-w-0">
              {creator?.avatar_url
                ? <img src={creator.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                : <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{creatorName[0]?.toUpperCase()}</span>}
              <span className="text-xs font-medium truncate inline-flex items-center gap-0.5">{creatorName}{creator && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}</span>
            </span>
            <span className="font-heading text-sm font-bold text-primary shrink-0">{formatPrize(publish.prize_amount, publish.currency)}</span>
          </div>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">View Winning Work <ArrowRight className="w-3.5 h-3.5" /></span>
        </div>
      </Link>
    </motion.div>
  );
}