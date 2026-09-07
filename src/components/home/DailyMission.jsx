import { motion } from 'framer-motion';
import { CheckCircle2, Gift, Zap } from 'lucide-react';
import { dailyMissions } from './mockData';

export default function DailyMission() {
  return (
    <div>
      <h2 className="font-heading text-lg font-semibold mb-3">Daily Career Mission</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {dailyMissions.map((m, i) => {
          const percent = Math.round((m.progress / m.total) * 100);
          const done = m.progress >= m.total;
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${done ? 'text-success' : ''}`}>{m.title}</span>
                {done ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Gift className="w-4 h-4 text-primary" />}
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden mb-2">
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(percent, 100)}%` }} transition={{ duration: 0.8, delay: 0.2 + i * 0.05 }}
                  className={`h-full rounded-full ${done ? 'bg-success' : 'bg-gradient-to-r from-primary to-primary/60'}`} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{m.progress} / {m.total}</span>
                <span className="flex items-center gap-1 text-primary font-medium"><Zap className="w-3 h-3" />{m.xpReward} XP</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}