import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Play, ChevronRight } from 'lucide-react';
import CountdownTimer from '@/components/CountdownTimer';

export default function ContinueWorking({ contests, loading }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold">Continue Working</h2>
        <Link to="/my-contests" className="text-xs text-primary hover:underline flex items-center gap-1">View All <ChevronRight className="w-3 h-3" /></Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2].map(i => <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : contests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {contests.slice(0, 4).map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-sm line-clamp-1 flex-1">{c.title}</h3>
                <span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold shrink-0 ml-2">₹{c.prize_amount?.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                <Clock className="w-3.5 h-3.5" /><CountdownTimer deadline={c.deadline} className="text-primary font-medium" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">In Progress</span>
                <Link to={`/contest/${c.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <Play className="w-3 h-3" /> Continue
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">No active contests. <Link to="/explore" className="text-primary hover:underline">Find one to join</Link></p>
        </div>
      )}
    </div>
  );
}