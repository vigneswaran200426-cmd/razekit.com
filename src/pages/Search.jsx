import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search as SearchIcon, IndianRupee, Clock, AtSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import CountdownTimer from '@/components/CountdownTimer';
import PageHeader, { SegmentedTabs } from '@/components/ui/PageHeader';
import AlertState from '@/components/alerts/AlertState';

const TABS = ['Contests', 'Creators'];

export default function SearchPage() {
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [contests, setContests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prizeFilter, setPrizeFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      base44.entities.Contest.filter({ status: 'open' }, '-created_date', 50).catch(() => []),
      base44.entities.UserProfile.list('-created_date', 50).catch(() => []),
    ]).then(([contestData, userData]) => {
      setContests(contestData);
      setUsers(userData);
    }).finally(() => setLoading(false));
  }, []);

  const filteredContests = contests.filter(c => {
    const matchesQuery = !query || c.title?.toLowerCase().includes(query.toLowerCase());
    const matchesPrize = prizeFilter === 'all' ||
      (prizeFilter === 'low' && c.prize_amount < 10000) ||
      (prizeFilter === 'mid' && c.prize_amount >= 10000 && c.prize_amount < 50000) ||
      (prizeFilter === 'high' && c.prize_amount >= 50000);
    const diff = new Date(c.deadline).getTime() - Date.now();
    const matchesTime = timeFilter === 'all' ||
      (timeFilter === '24h' && diff < 86400000) ||
      (timeFilter === '3d' && diff < 259200000) ||
      (timeFilter === '7d' && diff < 604800000);
    return matchesQuery && matchesPrize && matchesTime;
  });

  const filteredUsers = users.filter(u => {
    if (!query) return true;
    const q = query.toLowerCase().replace('@', '');
    const usernameMatch = u.username?.toLowerCase().includes(q);
    const nameMatch = u.display_name?.toLowerCase().includes(q);
    const exactUsername = u.username?.toLowerCase() === q;
    return usernameMatch || nameMatch || exactUsername;
  }).sort((a, b) => {
    const q = query.toLowerCase().replace('@', '');
    const aExact = a.username?.toLowerCase() === q ? 0 : 1;
    const bExact = b.username?.toLowerCase() === q ? 0 : 1;
    return aExact - bExact;
  });

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5 pb-8">
      <PageHeader title="Search" subtitle="Open contests and creators." icon={SearchIcon} />

      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={tab === 0 ? "Search contests..." : "Search @username or name..."} className="pl-11 h-12 rounded-full surface-2 elev-1 border-transparent text-[15px]" />
      </div>

      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 0 && (
        <>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <select value={prizeFilter} onChange={e => setPrizeFilter(e.target.value)} className="bg-secondary text-sm rounded-full px-3.5 py-1.5 border-0 outline-none">
              <option value="all">All Prizes</option>
              <option value="low">{'< ₹10K'}</option>
              <option value="mid">₹10K-50K</option>
              <option value="high">₹50K+</option>
            </select>
            <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)} className="bg-secondary text-sm rounded-full px-3.5 py-1.5 border-0 outline-none">
              <option value="all">Any Time</option>
              <option value="24h">{'< 24h'}</option>
              <option value="3d">{'< 3 days'}</option>
              <option value="7d">{'< 7 days'}</option>
            </select>
          </div>

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 surface-muted rounded-2xl animate-pulse" />)}</div>
          ) : filteredContests.length > 0 ? (
            <div className="space-y-2">
              {filteredContests.map(c => (
                <Link key={c.id} to={`/contest/${c.id}`} className="flex items-center gap-3 surface rounded-2xl px-4 py-3.5 hover-lift elev-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 nums font-semibold text-foreground"><IndianRupee className="w-3 h-3 text-primary" />{c.prize_amount?.toLocaleString('en-IN')}</span>
                      <span className="flex items-center gap-1 nums"><Clock className="w-3 h-3" /><CountdownTimer deadline={c.deadline} /></span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <AlertState type="empty" shape="blob" title="No contests found" description="Try a different search or adjust your prize and time filters." />
          )}
        </>
      )}

      {tab === 1 && (
        <>
          {filteredUsers.length > 0 ? (
            <div className="space-y-2">
              {filteredUsers.map(u => (
                <Link key={u.id} to={`/u/${u.username}`} className="flex items-center gap-3 surface rounded-2xl px-4 py-3.5 hover-lift elev-1">
                  <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="font-heading text-sm font-bold text-primary">{(u.display_name || u.username || '?')[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{u.display_name || u.username}</p>
                    <p className="text-xs text-primary flex items-center gap-0.5"><AtSign className="w-3 h-3" />{u.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <AlertState type={query ? 'not-found' : 'info'} shape={query ? 'diamond' : 'ring'} title={query ? 'No creators found' : 'Start typing to search creators'} />
          )}
        </>
      )}
    </div>
  );
}