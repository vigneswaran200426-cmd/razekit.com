import { useState } from 'react';
import { Crown, BarChart3, Sparkles } from 'lucide-react';
import WinnersList from '@/components/winners/WinnersList';
import CommunityLeaderboard from '@/components/community/CommunityLeaderboard';

const TABS = [
  { k: 'winners', label: 'Winners', Icon: Crown },
  { k: 'leaderboard', label: 'Leaderboard', Icon: BarChart3 },
];

export default function WinnersHub() {
  const [tab, setTab] = useState('winners');
  return (
    <div className="page-shell pb-10">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div><p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.16em] text-primary"><Sparkles className="w-3.5 h-3.5" /> RazeKit Showcase</p><h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">Winners Hub</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Discover winning creative work, then see the creators and performance behind it.</p></div>
          <div className="surface p-1 rounded-xl inline-flex w-fit">{TABS.map(({ k, label, Icon }) => <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${tab === k ? 'bg-primary text-primary-foreground shadow-primary-glow' : 'text-muted-foreground hover:text-foreground'}`}><Icon className="w-3.5 h-3.5" /> {label}</button>)}</div>
        </header>
        {tab === 'winners' ? <WinnersList /> : <CommunityLeaderboard />}
      </div>
    </div>
  );
}
