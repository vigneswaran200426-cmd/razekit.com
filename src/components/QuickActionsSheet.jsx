import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Upload, Compass, IndianRupee, HelpCircle, X } from 'lucide-react';

const ACTIONS = [
  { icon: Sparkles, label: 'Create Contest', to: '/create-contest', clientOnly: true, color: 'text-primary', bg: 'bg-primary/10' },
  { icon: Upload, label: 'Upload Post', to: '/winners-hub', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { icon: Compass, label: 'Browse Contests', to: '/explore', color: 'text-green-500', bg: 'bg-green-500/10' },
  { icon: IndianRupee, label: 'Withdraw', to: '/funds', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { icon: HelpCircle, label: 'Help', to: '/help', color: 'text-primary', bg: 'bg-primary/10' },
];

export default function QuickActionsSheet({ open, onClose, isClient }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60" />
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full max-w-md bg-card border border-border rounded-t-2xl p-4 pb-8"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-secondary mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg font-bold">Quick Actions</h2>
              <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {ACTIONS.filter(a => !a.clientOnly || isClient).map(a => {
                const Icon = a.icon;
                return (
                  <Link key={a.label} to={a.to} onClick={onClose}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-secondary/30 hover:bg-secondary/50 transition-colors">
                    <div className={`w-12 h-12 rounded-xl ${a.bg} flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${a.color}`} />
                    </div>
                    <span className="text-xs font-medium text-center">{a.label}</span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}