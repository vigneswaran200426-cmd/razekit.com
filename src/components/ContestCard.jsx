import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Users, ArrowUpRight, Zap, Trophy } from 'lucide-react';
import CountdownTimer from './CountdownTimer';
import VisualAssetImage from '@/components/visual/VisualAssetImage';
import { getWorkStatus } from '@/lib/contest-utils';
import { EASE } from '@/lib/motion';

// Currency-aware money formatter (contest.currency: INR default, USD for global).
const SYMBOL = { INR: '₹', USD: '$' };
function money(amount, currency = 'INR') {
  const sym = SYMBOL[currency] || '₹';
  const locale = currency === 'USD' ? 'en-US' : 'en-IN';
  return sym + Number(amount || 0).toLocaleString(locale);
}

const TONE = {
  primary: 'bg-primary/12 text-primary',
  accent: 'bg-accent/25 text-ink',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-[#B57200]',
  muted: 'bg-secondary text-muted-foreground',
};

// Razekit contest card — a media-first marketplace tile. Editorial cover with a
// gradient scrim, prize as the hero number, live deadline, and state chips that
// never rely on colour alone. Reused across Discover, dashboards, and profiles.
export default function ContestCard({ contest, submissionsCount, index = 0, className = '' }) {
  const status = getWorkStatus(contest);
  const hoursLeft = (new Date(contest.deadline).getTime() - Date.now()) / 3600000;
  const closingSoon = ['open', 'joined', 'working'].includes(contest.status) && hoursLeft > 0 && hoursLeft <= 48;
  const winners = Number(contest.number_of_winners || 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(index, 8) * 0.04 }}
      className={`h-full ${className}`}
    >
      <Link
        to={`/contest/${contest.id}`}
        aria-label={`${contest.title} — ${money(contest.prize_amount, contest.currency)} prize`}
        className="group relative flex flex-col h-full rounded-3xl bg-card border border-border/60 overflow-hidden shadow-elev-1 transition-all duration-300 ease-brand hover:shadow-elev-2 hover:border-primary/30 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {/* Cover */}
        <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
          <div className="absolute inset-0 transition-transform duration-[600ms] ease-brand group-hover:scale-[1.05]">
            <VisualAssetImage
              entityType="CONTEST"
              entityId={contest.id}
              assetType="CONTEST_THUMBNAIL"
              alt={`${contest.title} — contest artwork`}
            />
          </div>
          {/* scrim for chip legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/45 via-transparent to-ink/10" aria-hidden="true" />

          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
            {contest.category && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/90 text-ink backdrop-blur-sm shadow-sm">
                {contest.category}
              </span>
            )}
            {closingSoon && (
              <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-warning text-white font-semibold shadow-sm">
                <Zap className="w-3 h-3" aria-hidden="true" /> Closing soon
              </span>
            )}
          </div>

          <span className={`absolute bottom-3 left-3 text-[11px] px-2.5 py-1 rounded-full font-semibold backdrop-blur-sm ${TONE[status.tone]}`}>
            {status.label}
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-col flex-1 p-4">
          <h3 className="font-heading font-bold text-[17px] leading-snug tracking-tight line-clamp-2 text-ink group-hover:text-primary transition-colors ease-brand">
            {contest.title}
          </h3>
          {contest.short_description && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
              {contest.short_description}
            </p>
          )}

          <div className="mt-auto pt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground font-medium">Prize</p>
              <p className="font-heading text-2xl font-extrabold text-primary leading-none nums mt-0.5">
                {money(contest.prize_amount, contest.currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground font-medium">Ends in</p>
              <p className="text-sm font-semibold text-ink flex items-center gap-1 justify-end nums mt-0.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                <CountdownTimer deadline={contest.deadline} />
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3.5 pt-3.5 border-t border-border/60 text-xs text-muted-foreground">
            {winners > 1 && (
              <span className="flex items-center gap-1 nums"><Trophy className="w-3.5 h-3.5" aria-hidden="true" />{winners} winners</span>
            )}
            {submissionsCount != null && (
              <span className="flex items-center gap-1 nums"><Users className="w-3.5 h-3.5" aria-hidden="true" />{submissionsCount} entries</span>
            )}
            <span className="ml-auto inline-flex items-center gap-1 text-primary font-semibold group-hover:gap-1.5 transition-all ease-brand">
              View <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
