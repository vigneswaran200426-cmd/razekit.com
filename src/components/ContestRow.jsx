import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IndianRupee, Clock, ArrowRight } from 'lucide-react';
import CountdownTimer from './CountdownTimer';
import { EASE } from '@/lib/motion';

export default function ContestRow({ contest, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(index * 0.05, 0.4) }}
    >
      <Link to={`/contest/${contest.id}`}
        className="group flex items-center gap-3 glass-card rounded-xl pl-0 pr-4 py-3.5 hover:shadow-glass-lg transition-shadow duration-200 overflow-hidden">
        <div className="w-1 self-stretch bg-primary/40 rounded-full shrink-0" />
        <div className="flex-1 min-w-0 pl-3">
          <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{contest.title}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5 text-primary font-semibold">
              <IndianRupee className="w-3 h-3" />{contest.prize_amount?.toLocaleString('en-IN')}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <CountdownTimer deadline={contest.deadline} />
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </Link>
    </motion.div>
  );
}