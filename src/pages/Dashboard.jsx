import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Trophy, FileText, Wallet as WalletIcon, Plus, IndianRupee, Users, Flag } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, moneyMinor } from '@/lib/format';
import { PageHeader, StatTile, Card, Button, EmptyState, Skeleton } from '@/components/ui';
import CampaignCarousel from '@/components/CampaignCarousel';
import ContestCard from '@/components/ContestCard';

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
function Section({ title, to, children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold text-ink">{title}</h2>{to && <Link to={to} className="text-sm font-semibold text-primary hover:underline">View all</Link>}</div>
      {children}
    </section>
  );
}
function LoadingGrid() { return <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>; }

export default function Dashboard() {
  const { user, role } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const uid = user.id;
      const isClient = role === 'client';
      const [allContests, mySubs, wallets] = await Promise.all([
        entities.Contest.list('-created_date', 100).catch(() => []),
        isClient ? entities.Submission.filter({ client_id: uid }, '-created_date', 100).catch(() => [])
          : entities.Submission.filter({ created_by_id: uid }, '-created_date', 100).catch(() => []),
        entities.Wallet.filter({ user_id: uid }, '-created_date', 1).catch(() => []),
      ]);
      setData({ allContests: allContests || [], mySubs: mySubs || [], wallet: (wallets || [])[0] || null });
    })();
  }, [user?.id, role]);

  const firstName = (user?.full_name || user?.email?.split('@')[0] || 'there').split(' ')[0];

  if (!data) return <div className="space-y-6"><PageHeader eyebrow={role} title={`${greeting()}, ${firstName}`} /><LoadingGrid /></div>;

  const { allContests, mySubs, wallet } = data;
  const byId = Object.fromEntries(allContests.map((c) => [c.id, c]));

  if (role === 'client') {
    const mine = allContests.filter((c) => c.created_by_id === user.id);
    const active = mine.filter((c) => !['draft', 'completed', 'winner_selected'].includes(c.status));
    const winners = mine.filter((c) => ['winner_selected', 'completed'].includes(c.status));
    const drafts = mine.filter((c) => c.status === 'draft');
    return (
      <div className="space-y-8">
        <CampaignCarousel />
        <PageHeader title={`${greeting()}, ${firstName}`} description="Your campaigns at a glance."
          actions={<Button to="/create-contest"><Plus className="w-4 h-4" /> New contest</Button>} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Active contests" value={active.length} icon={Flag} />
          <StatTile label="Submissions" value={mySubs.length} icon={FileText} />
          <StatTile label="Winners" value={winners.length} icon={Trophy} />
          <StatTile label="Drafts" value={drafts.length} icon={FileText} />
        </div>
        <Section title="Active campaigns" to="/work">
          {active.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{active.slice(0, 6).map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}</div>
            : <EmptyState icon={Compass} title="No active contests" description="Launch a contest to start receiving entries." action={<Button to="/create-contest"><Plus className="w-4 h-4" />New contest</Button>} />}
        </Section>
      </div>
    );
  }

  // Creator (and admin fallback)
  const joinedIds = mySubs.map((s) => s.contest_id);
  const myContests = allContests.filter((c) => joinedIds.includes(c.id));
  const active = myContests.filter((c) => ['open', 'joined', 'working', 'submitted', 'reviewing'].includes(c.status));
  const wins = allContests.filter((c) => c.winner_user_id === user.id);
  const open = allContests.filter((c) => c.status === 'open');
  const earnings = wallet ? (wallet.available_balance != null ? money(wallet.available_balance, wallet.currency) : moneyMinor(wallet.available_balance_minor, wallet.currency)) : money(0);

  return (
    <div className="space-y-8">
      <CampaignCarousel />
        <PageHeader title={`${greeting()}, ${firstName}`} description="Here’s what’s happening and what to do next." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Active" value={active.length} icon={Compass} />
        <StatTile label="Submitted" value={mySubs.length} icon={FileText} />
        <StatTile label="Wins" value={wins.length} icon={Trophy} />
        <StatTile label="Earnings" value={earnings} icon={WalletIcon} />
      </div>

      {active.length > 0 && (
        <Section title="Your active contests" to="/work">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{active.slice(0, 3).map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}</div>
        </Section>
      )}

      <Section title="Recommended for you" to="/explore">
        {open.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{open.slice(0, 4).map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}</div>
          : <EmptyState icon={Compass} title="No open contests right now" description="New contests appear here — check back soon." action={<Button to="/explore" variant="secondary">Browse all</Button>} />}
      </Section>
    </div>
  );
}
