import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Users, Zap, ChevronRight } from 'lucide-react';
import CountdownTimer from '@/components/CountdownTimer';

export default function RecommendedContests({ contests, loading }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold">Recommended Contests</h2>
        <Link to="/explore" className="text-xs text-primary hover:underline flex items-center gap-1">Explore All <ChevronRight className="w-3 h-3" /></Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-36 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : contests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {contests.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">{c.category}</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">₹{c.prize_amount?.toLocaleString('en-IN')}</span>
              </div>
              <h3 className="font-semibold text-sm mb-1 line-clamp-1">{c.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-1 mb-3">{c.description}</p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /><CountdownTimer deadline={c.deadline} className="text-primary font-medium" /></span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{12 + i} joined</span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-primary" />{150 + i * 25} XP</span>
              </div>
              <Link to={`/contest/${c.id}`} className="block text-center text-xs font-semibold text-primary-foreground bg-primary rounded-lg py-2 hover:bg-primary/90 transition-colors">
                Join Contest
              </Link>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">No recommendations yet</p>
        </div>
      )}
    </div>
  );
}