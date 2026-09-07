import { motion } from 'framer-motion';
import { Trophy, Users, Target, Star, Activity, IndianRupee } from 'lucide-react';
import { statistics } from './mockData';

const iconMap = { Trophy, Users, Target, Star, Activity, IndianRupee };

export default function Statistics() {
  return (
    <div>
      <h2 className="font-heading text-lg font-semibold mb-3">Statistics</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {statistics.map((s, i) => {
          const Icon = iconMap[s.icon] || Trophy;
          return (
            <motion.div key={s.label} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-xl p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <p className="font-heading text-xl font-bold">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}