import { useState } from 'react';
import { Crown, BarChart3 } from 'lucide-react';
import WinnersList from '@/components/winners/WinnersList';
import CommunityLeaderboard from '@/components/community/CommunityLeaderboard';

const TABS = [
  { k: 'winners', label: 'Winners', Icon: Crown },
  { k: 'leaderboard', label: 'Leaderboard', Icon: BarChart3 },
];

export default function WinnersHub() {
  const [tab, setTab] = useState('winners');

  return (
    <div className="pb-8">
      {/* Tab bar (Winners + Leaderboard) — the Winners hero provides the page title */}
      <div className="sticky top-0 z-40 bg-background/75 backdrop-blur-xl border-b border-border/70">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex gap-2 bg-secondary/60 rounded-full p-1 w-fit">
            {TABS.map(({ k, label, Icon }) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${tab === k ? 'bg-primary text-primary-foreground shadow-primary-glow' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'winners' && <WinnersList />}
      {tab === 'leaderboard' && <CommunityLeaderboard />}
    </div>
  );
}
