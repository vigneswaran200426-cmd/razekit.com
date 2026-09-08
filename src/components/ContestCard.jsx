import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Users, ArrowUpRight, Trophy, Zap } from 'lucide-react';
import { money, timeLeft } from '@/lib/format';
import { Badge } from '@/components/ui';

// Deterministic soft gradient cover from the contest id (used when no artwork).
function cover(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 72% 48%))`;
}

const STATUS = {
  open: { label: 'Open', tone: 'primary' },
  joined: { label: 'Live', tone: 'primary' },
  working: { label: 'Live', tone: 'primary' },
  submitted: { label: 'In review', tone: 'warning' },
  reviewing: { label: 'Judging', tone: 'warning' },
  winner_selected: { label: 'Winner picked', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  paused: { label: 'Paused', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
};

export default function ContestCard({ contest, entries, index = 0 }) {
  const s = STATUS[contest.status] || STATUS.open;
  const hrs = (new Date(contest.deadline).getTime() - Date.now()) / 3600000;
  const soon = ['open', 'joined', 'working'].includes(contest.status) && hrs > 0 && hrs <= 48;
  const winners = Number(contest.number_of_winners || 1);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 8) * 0.03 }} className="h-full">
      <Link to={`/contest/${contest.id}`}
        className="group flex flex-col h-full rounded-lg bg-surface border border-line overflow-hidden shadow-xs transition-all duration-200 ease-brand hover:shadow-md hover:border-line-strong hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg">
        {/* Cover */}
        <div className="relative aspect-[16/9] overflow-hidden">
          {contest.cover_image_url
            ? <img src={contest.cover_image_url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            : <div className="w-full h-full transition-transform duration-500 group-hover:scale-105" style={{ background: cover(contest.id) }} />}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/35 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
            {contest.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-surface/90 text-ink">{contest.category}</span>}
            {soon && <Badge tone="warning"><Zap className="w-3 h-3" />Soon</Badge>}
          </div>
          <div className="absolute bottom-2.5 left-2.5"><Badge tone={s.tone}>{s.label}</Badge></div>
        </div>
        {/* Body */}
        <div className="flex flex-col flex-1 p-3.5">
          <h3 className="font-display font-bold text-[16px] leading-snug line-clamp-2 text-ink group-hover:text-primary transition-colors">{contest.title}</h3>
          <div className="mt-auto pt-3.5 flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted font-medium">Prize</p>
              <p className="font-display text-xl font-extrabold text-primary nums leading-none mt-0.5">{money(contest.prize_amount, contest.currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted font-medium">Ends in</p>
              <p className="text-sm font-semibold text-ink nums leading-none mt-1 flex items-center gap-1 justify-end"><Clock className="w-3.5 h-3.5 text-muted" />{timeLeft(contest.deadline)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line text-xs text-muted">
            {winners > 1 && <span className="flex items-center gap-1 nums"><Trophy className="w-3.5 h-3.5" />{winners}</span>}
            {entries != null && <span className="flex items-center gap-1 nums"><Users className="w-3.5 h-3.5" />{entries}</span>}
            <span className="ml-auto inline-flex items-center gap-1 text-primary font-semibold">View <ArrowUpRight className="w-3.5 h-3.5" /></span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
