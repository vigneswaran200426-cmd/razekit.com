import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Heart, BadgeCheck, Trophy } from 'lucide-react';
import { EASE } from '@/lib/motion';
import { formatPrize } from '@/lib/utils';

const VIDEO_CATS = ['Instagram Reel', 'YouTube Shorts', 'YouTube Video', 'Advertisement', 'Gaming', 'Music Video', 'Documentary', 'Travel', 'Wedding', 'Corporate'];

// A verified winner card — real finalized-contest data, reference-matched.
export default function WinnerCard({ contest, winner, client, index = 0, onOpen }) {
  const [liked, setLiked] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem('razekit_fav_winners') || '{}')[contest.id]; } catch { return false; }
  });
  const name = winner?.display_name || winner?.username || `Creator #${contest.winner_user_id?.slice(-4)?.toUpperCase()}`;
  const clientName = client?.company_name || client?.display_name || client?.username || 'Brand';
  const date = contest.winner_selected_at ? new Date(contest.winner_selected_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const isVideo = VIDEO_CATS.includes(contest.category);

  const toggleLike = (e) => {
    e.stopPropagation();
    try {
      const m = JSON.parse(localStorage.getItem('razekit_fav_winners') || '{}');
      if (m[contest.id]) delete m[contest.id]; else m[contest.id] = 1;
      localStorage.setItem('razekit_fav_winners', JSON.stringify(m));
    } catch {}
    setLiked((v) => !v);
  };

  return (
    <motion.div
      role="button" tabIndex={0}
      onClick={() => onOpen?.(contest)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(contest); } }}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: Math.min(index, 8) * 0.05 }}
      whileHover={{ y: -3 }}
      className="cursor-pointer flex flex-col glass-card rounded-2xl overflow-hidden transition-shadow duration-200 hover:shadow-glass-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="relative h-40 bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 group overflow-hidden">
        {contest.cover_image_url && <img src={contest.cover_image_url} alt={contest.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-success/90 text-white font-semibold"><Trophy className="w-3 h-3" /> Winner</span>
        <button type="button" onClick={toggleLike} aria-label={liked ? 'Remove favorite' : 'Add favorite'} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/85 backdrop-blur flex items-center justify-center hover:scale-110 active:scale-95 transition-transform">
          <Heart className={`w-4 h-4 ${liked ? 'fill-destructive text-destructive' : 'text-muted-foreground'}`} />
        </button>
        {isVideo && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center shadow-md"><Play className="w-5 h-5 text-primary fill-primary ml-0.5" /></span>
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <span className="text-[11px] text-primary font-medium">{contest.category}</span>
        <h3 className="font-heading font-semibold text-[15px] leading-snug line-clamp-1 mt-0.5">{contest.title}</h3>
        <p className="text-xs text-muted-foreground truncate">{clientName}</p>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60 gap-2">
          <span className="flex items-center gap-2 min-w-0">
            {winner?.avatar_url
              ? <img src={winner.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
              : <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{name[0]?.toUpperCase()}</span>}
            <span className="text-xs font-medium truncate inline-flex items-center gap-0.5">{name}{winner && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}</span>
          </span>
          <span className="font-heading text-sm font-bold text-primary shrink-0">{formatPrize(contest.prize_amount, contest.currency)}</span>
        </div>
        {date && <p className="text-[10px] text-muted-foreground mt-2">{date}</p>}
      </div>
    </motion.div>
  );
}