import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, IndianRupee, Users, ArrowRight, Zap } from 'lucide-react';
import CountdownTimer from './CountdownTimer';
import VisualAssetImage from '@/components/visual/VisualAssetImage';
import { getWorkStatus } from '@/lib/contest-utils';
import { EASE } from '@/lib/motion';

const TONE = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-accent/20 text-[#0C2444]',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-[#D78C05]',
  muted: 'bg-secondary text-muted-foreground',
};

// Marketplace contest card — media-first cover with hover zoom, scannable
// prize/deadline row, and state chips that never rely on color alone.
export default function ContestCard({ contest, submissionsCount, index = 0, className = '' }) {
  const status = getWorkStatus(contest);
  const hoursLeft = (new Date(contest.deadline).getTime() - Date.now()) / 3600000;
  const closingSoon = ['open', 'joined', 'working'].includes(contest.status) && hoursLeft > 0 && hoursLeft <= 48;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: Math.min(index, 8) * 0.05 }}
      whileHover={{ y: -2 }}
      className={`h-full ${className}`}
    >
      <Link
        to={`/contest/${contest.id}`}
        className="group flex flex-col h-full surface rounded-2xl overflow-hidden transition-shadow duration-200 ease-brand hover:shadow-elev-2"
      >
        {/* Cover — Visual Asset System artwork with a calm hover zoom */}
        <div className="relative h-40 sm:h-44 overflow-hidden">
          <div className="absolute inset-0 transition-transform duration-500 ease-brand group-hover:scale-[1.04]">
            <VisualAssetImage
              entityType="CONTEST"
              entityId={contest.id}
              assetType="CONTEST_THUMBNAIL"
              alt={`${contest.title} — contest artwork`}
            />
          </div>
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/85 text-foreground font-medium backdrop-blur-sm">
              {contest.category}
            </span>
            {closingSoon && (
              <span className="flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-warning/90 text-white font-semibold shadow-sm">
                <Zap className="w-3 h-3" /> Closing soon
              </span>
            )}
          </div>
          <span className={`absolute bottom-3 right-3 text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-white/90 ${TONE[status.tone]}`}>
            {status.label}
          </span>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-heading font-semibold text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors ease-brand">
            {contest.title}
          </h3>

          <div className="flex items-end justify-between mt-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Prize</p>
              <p className="font-heading text-xl font-bold text-primary flex items-center nums">
                <IndianRupee className="w-4 h-4" />{contest.prize_amount?.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Deadline</p>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1 justify-end nums">
                <Clock className="w-3.5 h-3.5" /><CountdownTimer deadline={contest.deadline} />
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
            {submissionsCount != null && (
              <span className="flex items-center gap-1 nums"><Users className="w-3 h-3" />{submissionsCount}</span>
            )}
            <span className="ml-auto text-primary font-medium flex items-center gap-0.5 group-hover:gap-1.5 transition-all ease-brand">
              View <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}