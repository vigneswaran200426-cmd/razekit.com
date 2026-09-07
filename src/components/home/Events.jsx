import { motion } from 'framer-motion';
import { Calendar, ChevronRight } from 'lucide-react';
import CountdownTimer from '@/components/CountdownTimer';
import { events } from './mockData';

export default function Events() {
  return (
    <div>
      <h2 className="font-heading text-lg font-semibold mb-3">Limited-Time Events</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {events.map((e, i) => (
          <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="relative overflow-hidden bg-gradient-to-br from-card via-card to-secondary/40 border border-border rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{e.badge}</span>
              </div>
              <span className="text-[11px] text-primary font-medium"><CountdownTimer deadline={e.deadline} /></span>
            </div>
            <h3 className="font-semibold text-sm mb-1">{e.title}</h3>
            <p className="text-xs text-muted-foreground">{e.desc}</p>
            <button className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Participate <ChevronRight className="w-3 h-3" />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}