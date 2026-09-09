// RazeKit Tracker — professional performance intelligence (spec 29-32).
// Two role-specific experiences over one shared design language. Read-only:
// every score comes from the server's scoring engine.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, Trophy, Users, FileText, MousePointerClick, ShieldCheck,
  TrendingUp, AlertCircle, Clock, Wallet, Target,
} from 'lucide-react';
import { fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, timeLeft, dateShort } from '@/lib/format';
import { Card, Spinner, PageHeader, Segmented, EmptyState, Badge } from '@/components/ui';
import { ScoreBreakdown, ScorePill, ScoreStateBadge } from '@/components/Score';

const nf = (n) => (typeof n === 'number' ? n.toLocaleString('en-IN') : '—');

function Kpi({ label, value, sub, icon: Icon, accent }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        {Icon && <Icon className={`w-4 h-4 ${accent ? 'text-primary' : 'text-muted'}`} aria-hidden="true" />}
      </div>
      <p className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-ink nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </Card>
  );
}

function Freshness({ at }) {
  if (!at) return <span className="text-[11px] text-muted">No activity recorded yet</span>;
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000));
  const txt = mins < 1 ? 'Updated just now' : mins < 60 ? `Updated ${mins}m ago` : mins < 1440 ? `Updated ${Math.round(mins / 60)}h ago` : `Updated ${dateShort(at)}`;
  return <span className="inline-flex items-center gap-1 text-[11px] text-muted"><Clock className="w-3 h-3" aria-hidden="true" />{txt}</span>;
}

function TrafficPanel({ traffic }) {
  if (!traffic) return null;
  const { total_clicks: total, verified_clicks: verified, unique_visitors: unique, excluded_clicks: excluded } = traffic;
  if (!total) {
    return (
      <Card className="p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Brand traffic</h2>
        <EmptyState
          icon={MousePointerClick}
          title="No verified traffic yet"
          description="Traffic appears once your tracked campaign link starts receiving real visits."
          className="py-6"
        />
      </Card>
    );
  }
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Brand traffic</h2>
        <Freshness at={traffic.updated_at} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><p className="text-[11px] text-muted">Total clicks</p><p className="font-display text-xl font-extrabold text-ink nums">{nf(total)}</p></div>
        <div><p className="text-[11px] text-muted">Verified</p><p className="font-display text-xl font-extrabold text-success nums">{nf(verified)}</p></div>
        <div><p className="text-[11px] text-muted">Unique visitors</p><p className="font-display text-xl font-extrabold text-primary nums">{nf(unique)}</p></div>
        <div><p className="text-[11px] text-muted">Excluded</p><p className="font-display text-xl font-extrabold text-muted nums">{nf(excluded)}</p></div>
      </div>
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-success mt-px" aria-hidden="true" />
        Only verified visits count toward Brand Traffic. Activity that cannot be verified is excluded from performance calculations.
      </p>
    </Card>
  );
}

// ── CREATOR ───────────────────────────────────────────────────────────────────
function CreatorTracker({ name }) {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fn('trackerCreatorOverview').then(setData).catch((e) => setErr(e?.data?.error?.message || e.message || 'Could not load your performance.'));
    fn('trackerCreatorContests').then((d) => setRows(d.contests || [])).catch(() => setRows([]));
  }, []);

  if (err) return <Card className="p-5"><p className="text-sm text-danger">{err}</p></Card>;
  if (!data) return <div className="py-16 grid place-items-center"><Spinner className="w-7 h-7" /></div>;

  const k = data.kpis;
  const best = (rows || []).filter((r) => typeof r.final_score === 'number').sort((a, b) => b.final_score - a.final_score)[0];

  return (
    <div className="space-y-5">
      <Segmented
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'contests', label: 'My contests' },
          { key: 'traffic', label: 'Traffic' },
        ]}
      />

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Contests joined" value={nf(k.contests_joined)} sub={`${nf(k.active_contests)} active`} icon={Target} />
            <Kpi label="Wins" value={nf(k.wins)} sub={k.win_rate === null ? 'No completed contests yet' : `${k.win_rate}% win rate`} icon={Trophy} accent />
            <Kpi label="Prizes earned" value={k.prizes_earned ? money(k.prizes_earned, k.currency) : '—'} sub="From won contests" icon={Wallet} />
            <Kpi label="Avg final score" value={k.average_final_score === null ? '—' : k.average_final_score.toFixed(1)} sub={k.average_final_score === null ? 'No finalized scores yet' : 'Across finalized contests'} icon={TrendingUp} />
          </div>

          {best ? (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Your best performance</h2>
                <Link to={`/contest/${best.contest_id}`} className="text-[12px] font-medium text-primary hover:underline">{best.contest_title}</Link>
              </div>
              <ScoreBreakdown engagement={best.engagement_score} traffic={best.traffic_score} final={best.final_score} state={best.score_state} />
            </Card>
          ) : (
            <Card className="p-5">
              <EmptyState icon={Activity} title="No finalized performance data yet" description="Join a contest and submit your work. Once results are finalized, your scores appear here." className="py-8" />
            </Card>
          )}

          <TrafficPanel traffic={data.traffic} />
        </div>
      )}

      {tab === 'contests' && (
        rows === null ? <div className="py-12 grid place-items-center"><Spinner /></div>
        : rows.length === 0 ? <EmptyState icon={Target} title="You haven't joined a contest yet" description="Browse open contests and submit your first entry." action={<Link to="/discover" className="text-primary font-medium hover:underline">Discover contests</Link>} />
        : (
          <Card className="p-0 overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 border-b border-line">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-4 py-2.5 font-semibold">Contest</th>
                    <th className="px-3 py-2.5 font-semibold">Prize</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Engagement</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Traffic</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Final</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Rank</th>
                    <th className="px-4 py-2.5 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.submission_id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <Link to={`/contest/${r.contest_id}`} className="font-medium text-ink hover:text-primary">{r.contest_title}</Link>
                        <p className="text-[11px] text-muted">{r.category || '—'}</p>
                      </td>
                      <td className="px-3 py-3 nums text-muted">{money(r.prize_amount, r.currency)}</td>
                      <td className="px-3 py-3 text-right"><ScorePill value={r.engagement_score} /></td>
                      <td className="px-3 py-3 text-right"><ScorePill value={r.traffic_score} /></td>
                      <td className="px-3 py-3 text-right"><ScorePill value={r.final_score} /></td>
                      <td className="px-3 py-3 text-right nums text-muted">{r.rank ?? '—'}</td>
                      <td className="px-4 py-3">
                        {r.is_winner ? <Badge tone="success">Won</Badge> : <ScoreStateBadge state={r.score_state} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards (spec 15: not a shrunken table) */}
            <div className="md:hidden divide-y divide-line">
              {rows.map((r) => (
                <div key={r.submission_id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link to={`/contest/${r.contest_id}`} className="font-medium text-ink">{r.contest_title}</Link>
                      <p className="text-[11px] text-muted nums">{money(r.prize_amount, r.currency)}</p>
                    </div>
                    {r.is_winner ? <Badge tone="success">Won</Badge> : <ScoreStateBadge state={r.score_state} />}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-[10px] uppercase tracking-wider text-muted">Engage</p><ScorePill value={r.engagement_score} /></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-muted">Traffic</p><ScorePill value={r.traffic_score} /></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-muted">Final</p><ScorePill value={r.final_score} /></div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      )}

      {tab === 'traffic' && <TrafficPanel traffic={data.traffic} />}
    </div>
  );
}

// ── BRAND ─────────────────────────────────────────────────────────────────────
function BrandTracker() {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [camps, setCamps] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fn('trackerBrandOverview').then(setData).catch((e) => setErr(e?.data?.error?.message || e.message || 'Could not load campaign performance.'));
    fn('trackerBrandCampaigns').then((d) => setCamps(d.campaigns || [])).catch(() => setCamps([]));
  }, []);

  if (err) return <Card className="p-5"><p className="text-sm text-danger">{err}</p></Card>;
  if (!data) return <div className="py-16 grid place-items-center"><Spinner className="w-7 h-7" /></div>;
  const k = data.kpis;

  return (
    <div className="space-y-5">
      <Segmented
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'campaigns', label: 'Campaigns' },
          { key: 'traffic', label: 'Traffic' },
        ]}
      />

      {tab === 'overview' && (
        <div className="space-y-5">
          {data.attention?.length > 0 && (
            <Card className="p-4 border-warning/30 bg-warning/[0.05]">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink">
                <AlertCircle className="w-3.5 h-3.5 text-warning" aria-hidden="true" /> Needs attention
              </h2>
              <ul className="mt-2 space-y-1">
                {data.attention.map((a) => <li key={a.kind} className="text-sm text-muted">{a.message}</li>)}
              </ul>
            </Card>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Campaigns" value={nf(k.total_campaigns)} sub={`${nf(k.active_campaigns)} active`} icon={Target} accent />
            <Kpi label="Submissions" value={nf(k.submissions)} sub={`${nf(k.participants)} creators`} icon={FileText} />
            <Kpi label="Verified visitors" value={nf(data.traffic.unique_visitors)} sub="Sent to your brand" icon={MousePointerClick} />
            <Kpi label="Prize committed" value={k.total_prize_value ? money(k.total_prize_value, k.currency) : '—'} sub={`${nf(k.winners)} winners`} icon={Trophy} />
          </div>

          <TrafficPanel traffic={data.traffic} />
        </div>
      )}

      {tab === 'campaigns' && (
        camps === null ? <div className="py-12 grid place-items-center"><Spinner /></div>
        : camps.length === 0 ? <EmptyState icon={Target} title="No campaigns yet" description="Launch your first contest to start measuring creator performance." action={<Link to="/create-contest" className="text-primary font-medium hover:underline">Launch a contest</Link>} />
        : (
          <div className="space-y-3">
            {camps.map((c) => (
              <Card key={c.contest_id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/contest/${c.contest_id}`} className="font-display font-bold text-ink hover:text-primary">{c.title}</Link>
                    <p className="text-[11px] text-muted mt-0.5">
                      {money(c.prize_amount, c.currency)} · {c.category || 'Uncategorised'}
                      {c.min_duration_days ? ` · ${c.min_duration_days}–${c.max_duration_days}d window` : ''}
                    </p>
                  </div>
                  <Badge tone={c.status === 'open' ? 'primary' : c.winner_user_id ? 'success' : 'neutral'}>{c.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center sm:text-left">
                  <div><p className="text-[10px] uppercase tracking-wider text-muted">Creators</p><p className="font-display font-extrabold text-ink nums">{nf(c.participants)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-muted">Entries</p><p className="font-display font-extrabold text-ink nums">{nf(c.submissions)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-muted">Visitors</p><p className="font-display font-extrabold text-primary nums">{nf(c.verified_visitors)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-muted">Avg score</p><p className="font-display font-extrabold text-ink nums">{c.average_final_score === null ? '—' : c.average_final_score.toFixed(1)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-muted">Top score</p><p className="font-display font-extrabold text-ink nums">{c.top_final_score === null ? '—' : c.top_final_score.toFixed(1)}</p></div>
                </div>
                {!c.has_destination && (
                  <p className="mt-3 text-[11px] text-muted flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
                    No campaign destination set — Brand Traffic cannot be measured for this campaign.
                  </p>
                )}
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'traffic' && <TrafficPanel traffic={data.traffic} />}
    </div>
  );
}

export default function Tracker() {
  const { user, role } = useAuth();
  const isBrand = role === 'client';
  const name = user?.full_name || user?.email?.split('@')[0] || '';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tracker"
        title={isBrand ? (name ? `${name} — campaign performance` : 'Campaign performance') : (name ? `${name}'s performance` : 'Your performance')}
        description={isBrand
          ? 'How your campaigns, creators and verified brand traffic are performing.'
          : 'Your contests, scores, verified traffic and winnings — measured, not estimated.'}
      />
      {isBrand ? <BrandTracker /> : <CreatorTracker name={name} />}
    </div>
  );
}
