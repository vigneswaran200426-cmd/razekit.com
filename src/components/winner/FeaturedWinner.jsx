import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Play, Trophy, BadgeCheck, ArrowRight, Building2 } from 'lucide-react';
import { EASE } from '@/lib/motion';
import { formatPrize } from '@/lib/utils';
import { placementLabel } from '@/lib/winner-publish';
import { useWinnerPoster } from './WinnerMedia';

// Editorial featured composition — the latest published winner, media-forward.
export default function FeaturedWinner({ publish, creator, client }) {
  const poster = useWinnerPoster(publish);
  const creatorName = creator?.display_name || creator?.username || `Creator #${publish.creator_id?.slice(-4)?.toUpperCase()}`;
  const clientName = client?.company_name || client?.display_name || client?.username || 'Brand';
  const video = publish.media_type !== 'image';
  const date = publish.published_at ? new Date(publish.published_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-3xl glass-card mb-6"
    >
      <div className="grid lg:grid-cols-5">
        {/* Media hero — 3 of 5 columns on desktop */}
        <Link to={`/winner/${publish.id}`} className="lg:col-span-3 relative aspect-video lg:aspect-auto lg:min-h-[360px] block bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 group overflow-hidden">
          {poster
            ? <img src={poster} alt={publish.title || 'Winning work'} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
            : null}
          <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-foreground/70 backdrop-blur text-white font-semibold">
            <Trophy className="w-3.5 h-3.5" /> {placementLabel(publish.placement || 1)}
          </span>
          {video && (
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Play className="w-7 h-7 text-primary fill-primary ml-1" /></span>
            </span>
          )}
        </Link>
        {/* Editorial info */}
        <div className="lg:col-span-2 p-6 md:p-8 flex flex-col justify-center">
          <span className="text-[11px] font-semibold tracking-widest text-primary bg-primary/10 rounded-full px-3 py-1 w-fit mb-3">FEATURED WINNER</span>
          <h2 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight leading-tight">{publish.title}</h2>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{publish.description || publish.caption || ''}</p>
          <div className="flex items-center gap-3 mt-4">
            {creator?.avatar_url
              ? <img src={creator.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              : <span className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">{creatorName[0]?.toUpperCase()}</span>}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate inline-flex items-center gap-1">{creatorName}{creator && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}</p>
              <p className="text-xs text-muted-foreground truncate inline-flex items-center gap-1"><Building2 className="w-3 h-3" /> {clientName}</p>
            </div>
            <span className="ml-auto font-heading text-lg font-bold text-primary shrink-0">{formatPrize(publish.prize_amount, publish.currency)}</span>
          </div>
          <div className="flex items-center justify-between mt-5">
            <span className="text-xs text-muted-foreground">{date && <>Published {date}</>}</span>
            <Link to={`/winner/${publish.id}`} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-[#0B48E8] hover:shadow-primary-glow hover:-translate-y-px transition-all duration-200">
              View Winning Work <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
      <span className="hidden lg:block absolute left-1/2 top-1/2 -translate-y-1/2 w-px h-24 bg-border" />
    </motion.section>
  );
}