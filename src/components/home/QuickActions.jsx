import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Scissors, FileText, BarChart3, FolderOpen, ArrowDownToLine } from 'lucide-react';

const actions = [
  { label: 'Find Contest', icon: Search, to: '/explore' },
  { label: 'Continue Editing', icon: Scissors, to: '/my-contests' },
  { label: 'My Submissions', icon: FileText, to: '/my-contests' },
  { label: 'Leaderboard', icon: BarChart3, to: null },
  { label: 'Portfolio', icon: FolderOpen, to: null },
  { label: 'Withdraw', icon: ArrowDownToLine, to: '/funds' },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
      {actions.map((a, i) => {
        const Icon = a.icon;
        const inner = (
          <motion.div whileHover={{ y: -3 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className={`flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors ${!a.to ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-[11px] font-medium text-center leading-tight">{a.label}</span>
          </motion.div>
        );
        return a.to ? <Link key={a.label} to={a.to}>{inner}</Link> : <div key={a.label}>{inner}</div>;
      })}
    </div>
  );
}