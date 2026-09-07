import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { computeLeaderboard, monthLabel } from '@/lib/community-utils';
import { Loader2, Trophy, ChevronLeft, ChevronRight, Star, ShieldCheck, Zap, Award } from 'lucide-react';

const PERIODS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'all', label: 'All time' },
];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(monthK, delta) {
  const [y, m] = monthK.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function quarterOf(monthK) {
  const [y, m] = monthK.split('-').map(Number);
  const q = Math.ceil(m / 3);
  return { year: y, q, months: [(q - 1) * 3 + 1, (q - 1) * 3 + 2, q * 3].map(mm => `${y}-${String(mm).padStart(2, '0')}`) };
}

function quarterLabel(monthK) {
  const q = quarterOf(monthK);
  return `Q${q.q} ${q.year}`;
}

// Aggregate finalized MonthlyLeaderboard snapshots into ranked rows (trusted source).
function aggregate(snaps) {
  const map = new Map();
  for (const s of snaps) {
    let e = map.get(s.user_id);
    if (!e) {
      e = { user_id: s.user_id, username: s.username, display_name: s.display_name, avatar_url: s.avatar_url, verified_wins: 0, monthly_earnings: 0 };
      map.set(s.user_id, e);
    }
    e.verified_wins += s.verified_wins || 0;
    e.monthly_earnings += s.monthly_earnings || 0;
  }
  return rankLive([...map.values()]);
}

// Live fallback: compute ranked rows from authoritative Contest winner records.
function liveRowsForMonths(contests, months) {
  const map = new Map();
  for (const mk of months) {
    for (const r of computeLeaderboard(contests, mk)) {
      let e = map.get(r.user_id);
      if (!e) { e = { user_id: r.user_id, verified_wins: 0, monthly_earnings: 0 }; map.set(r.user_id, e); }
      e.verified_wins += r.verified_wins;
      e.monthly_earnings += r.monthly_earnings;
    }
  }
  return rankLive([...map.values()]);
}

function rankLive(arr) {
  arr.sort((a, b) => b.verified_wins - a.verified_wins || b.monthly_earnings - a.monthly_earnings);
  arr.forEach((r, i) => { r.rank = i + 1; });
  return arr;
}

export default function CommunityLeaderboard() {
  const [period, setPeriod] = useState('monthly');
  const [month, setMonth] = useState(currentMonthKey());
  const [snapshots, setSnapshots] = useState([]);
  const [contests, setContests] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [reviewStats, setReviewStats] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me().catch(() => null);
        setUser(me);
        const [sn, cs, rv] = await Promise.all([
          base44.entities.MonthlyLeaderboard.list('-created_date', 200).catch(() => []),
          base44.entities.Contest.list('-created_date', 200).catch(() => []),
          base44.entities.Review.list('-created_date', 500).catch(() => []),
        ]);
        setSnapshots(sn);
        setContests(cs);
        // Public verified-review ratings per creator (client → creator reviews only).
        const byCreator = new Map();
        rv.filter((r) => r.status === 'published' && (r.reviewer_role || 'client') === 'client')
          .forEach((r) => {
            if (!r.creator_id) return;
            const e = byCreator.get(r.creator_id) || { sum: 0, count: 0 };
            e.sum += r.overall_rating || 0;
            e.count += 1;
            byCreator.set(r.creator_id, e);
          });
        const rs = {};
        byCreator.forEach((v, k) => { rs[k] = { rating: (v.sum / v.count).toFixed(1), count: v.count }; });
        setReviewStats(rs);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const periodMonths = useMemo(() => {
    if (period === 'all') return null;
    if (period === 'monthly') return [month];
    return quarterOf(month).months;
  }, [period, month]);

  const periodLabel = useMemo(() => {
    if (period === 'all') return 'All time';
    if (period === 'monthly') return monthLabel(month).toUpperCase();
    return quarterLabel(month).toUpperCase();
  }, [period, month]);

  const rows = useMemo(() => {
    if (period === 'all') {
      if (snapshots.length) return aggregate(snapshots);
      const distinct = [...new Set(contests.map(c => {
        const d = new Date(c.winner_selected_at || c.completed_at || c.created_date);
        return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }).filter(Boolean))];
      return liveRowsForMonths(contests, distinct);
    }
    const months = periodMonths;
    const snaps = snapshots.filter(s => months.includes(s.month));
    if (snaps.length) return aggregate(snaps);
    return liveRowsForMonths(contests, months);
  }, [period, periodMonths, snapshots, contests]);

  // Enrich rows with public profiles.
  useEffect(() => {
    (async () => {
      const ids = [...new Set(rows.map(r => r.user_id))];
      const p = {};
      await Promise.all(ids.map(async (id) => {
        const pf = await base44.entities.UserProfile.filter({ user_id: id }, '-created_date', 1).catch(() => []);
        p[id] = pf[0] || null;
      }));
      setProfiles(p);
    })();
  }, [rows]);

  const canGoNewer = period !== 'all' && month < currentMonthKey();
  const goOlder = () => period === 'quarterly' ? setMonth(shiftMonth(month, -3)) : setMonth(shiftMonth(month, -1));
  const goNewer = () => period === 'quarterly' ? setMonth(shiftMonth(month, 3)) : setMonth(shiftMonth(month, 1));

  const myRow = user ? rows.find(r => r.user_id === user.id) : null;
  const myReviewStats = user ? reviewStats[user.id] : null;

  const fmt = (v, suffix = '') => (v == null || v === '' ? '—' : `${v}${suffix}`);

  const renderRankBadge = (rank) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-[#D78C05]" />;
    if (rank === 2) return <Award className="w-5 h-5 text-[#5F7597]" />;
    if (rank === 3) return <Award className="w-5 h-5 text-[#D78C05]/70" />;
    return <span className="font-heading font-bold text-sm text-muted-foreground">#{rank}</span>;
  };

  return (
    <div className="pb-20">
      <div className="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 py-4 space-y-5">

        {/* Period selector */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 p-1 bg-secondary rounded-full">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${period === p.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {period !== 'all' && (
            <div className="flex items-center gap-1.5">
              <button onClick={goOlder} aria-label="Older period" className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium tabular-nums min-w-[92px] text-center">{periodLabel}</span>
              <button onClick={goNewer} disabled={!canGoNewer} aria-label="Newer period"
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${canGoNewer ? 'bg-secondary text-muted-foreground hover:text-foreground' : 'bg-secondary/50 text-muted-foreground/40 cursor-not-allowed'}`}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Your rank card — always visible */}
        {user && (
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                  {myRow ? <span className="font-heading font-bold text-sm text-primary">#{myRow.rank}</span> : <span className="text-[10px] font-medium text-muted-foreground">—</span>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Your Rank</p>
                  <p className="text-sm font-semibold">{myRow ? `#${myRow.rank} ${myRow.rank <= 3 ? '· Top 3' : ''}` : 'Not ranked this period'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat icon={Star} label="Rating" value={fmt(myReviewStats?.rating)} />
                <Stat icon={ShieldCheck} label="Reviews" value={fmt(myReviewStats?.count)} />
                <Stat icon={Trophy} label="Wins" value={fmt(myRow?.verified_wins)} />
              </div>
            </div>
          </div>
        )}

        {/* Rankings body */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground mx-auto mb-3" />Calculating rankings…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-7 h-7 text-primary/70" />
            </div>
            <p className="font-medium text-foreground">Tuning the rankings</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">Creator performance is being calculated from verified contest results. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map(r => {
              const profile = profiles[r.user_id];
              const name = r.display_name || profile?.display_name || 'Creator';
              const avatar = r.avatar_url || profile?.avatar_url;
              const title = profile?.professional_title;
              const rating = reviewStats[r.user_id]?.rating;
              const reviewCount = reviewStats[r.user_id]?.count;
              const to = (r.username || profile?.username) ? `/u/${r.username || profile.username}` : null;
              const top3 = r.rank <= 3;

              const inner = top3 ? (
                <div className="flex items-center gap-3 glass-card rounded-2xl p-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">{renderRankBadge(r.rank)}</div>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                    {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <span className="font-heading text-base font-bold text-primary">{name[0]}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{name}</p>
                    {title && <p className="text-xs text-muted-foreground truncate">{title}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Trophy className="w-3 h-3" />{r.verified_wins}</span>
                      <span className="flex items-center gap-0.5"><Star className="w-3 h-3" />{fmt(rating)}</span>
                      <span className="flex items-center gap-0.5"><ShieldCheck className="w-3 h-3" />{fmt(reviewCount)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-card border border-border rounded-2xl p-3.5 hover:border-primary/40 transition-colors">
                  <div className="w-8 flex justify-center shrink-0">{renderRankBadge(r.rank)}</div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                    {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <span className="font-heading text-sm font-bold text-primary">{name[0]}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    {title && <p className="text-xs text-muted-foreground truncate">{title}</p>}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
                    <span className="flex items-center gap-0.5"><Trophy className="w-3 h-3" />{r.verified_wins}</span>
                    <span className="flex items-center gap-0.5"><Star className="w-3 h-3" />{fmt(rating)}</span>
                    <span className="flex items-center gap-0.5"><ShieldCheck className="w-3 h-3" />{fmt(reviewCount)}</span>
                  </div>
                </div>
              );
              return to ? <Link key={r.user_id} to={to}>{inner}</Link> : <div key={r.user_id}>{inner}</div>;
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground/80 text-center">Rankings derive from verified contest wins, prize value and brand review ratings — never community activity. Values can't be set manually.</p>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div>
      <Icon className="w-3.5 h-3.5 text-primary mx-auto mb-0.5" />
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}