// Admin Control Center (spec 11/12).
// A controlled operations surface — the backend remains the security authority
// and re-checks admin on every call.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, AlertTriangle, Users, Target, FileText, MousePointerClick,
  Trophy, LifeBuoy, Activity, ScrollText, Gauge,
} from 'lucide-react';
import { fn } from '@/lib/api';
import { money, dateShort } from '@/lib/format';
import { PageHeader, Card, Segmented, Spinner, Badge, EmptyState } from '@/components/ui';

const nf = (n) => (typeof n === 'number' ? n.toLocaleString('en-IN') : '—');
const SEV = { high: 'danger', medium: 'warning', low: 'neutral' };

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 font-display text-xl font-extrabold text-ink nums">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Group({ title, icon: Icon, children }) {
  return (
    <Card className="p-5 space-y-3">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />} {title}
      </h2>
      {children}
    </Card>
  );
}

function Overview() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { fn('adminOverview').then(setD).catch((e) => setErr(e?.data?.error || e.message)); }, []);
  if (err) return <Card className="p-5"><p className="text-sm text-danger">{String(err)}</p></Card>;
  if (!d) return <div className="py-16 grid place-items-center"><Spinner className="w-7 h-7" /></div>;
  const k = d.kpis;

  return (
    <div className="space-y-5">
      {d.attention.length > 0 && (
        <Card className="p-4 border-warning/30 bg-warning/[0.05]">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" aria-hidden="true" /> Needs attention
          </h2>
          <ul className="mt-2 space-y-1.5">
            {d.attention.map((a) => (
              <li key={a.kind} className="flex items-center gap-2 text-sm">
                <Badge tone={SEV[a.severity] || 'neutral'}>{a.count}</Badge>
                <span className="text-muted">{a.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Group title="Contests" icon={Target}>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <Stat label="Total" value={nf(k.contests.total)} />
          <Stat label="Draft" value={nf(k.contests.draft)} />
          <Stat label="Open" value={nf(k.contests.open)} />
          <Stat label="Past deadline" value={nf(k.contests.ended)} />
          <Stat label="Winner set" value={nf(k.contests.winner_selected)} />
          <Stat label="Completed" value={nf(k.contests.completed)} />
          <Stat label="Cancelled" value={nf(k.contests.cancelled)} />
        </div>
      </Group>

      <Group title="Submissions" icon={FileText}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="Total" value={nf(k.submissions.total)} />
          <Stat label="Pending review" value={nf(k.submissions.pending_review)} />
          <Stat label="Shortlisted" value={nf(k.submissions.shortlisted)} />
          <Stat label="Won" value={nf(k.submissions.won)} />
          <Stat label="In progress" value={nf(k.submissions.working)} />
        </div>
      </Group>

      <Group title="Traffic" icon={MousePointerClick}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="Links" value={nf(k.traffic.tracking_links)} />
          <Stat label="Total clicks" value={nf(k.traffic.total_clicks)} />
          <Stat label="Verified" value={nf(k.traffic.verified_clicks)} />
          <Stat label="Unique" value={nf(k.traffic.unique_visitors)} />
          <Stat label="Excluded" value={nf(k.traffic.excluded_clicks)} />
        </div>
      </Group>

      <div className="grid md:grid-cols-2 gap-4">
        <Group title="Finance" icon={Trophy}>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Prize committed" value={money(k.finance.total_prize_committed, 'INR')} />
            <Stat label="Payouts" value={nf(k.finance.payouts)} />
            <Stat label="Failed" value={nf(k.finance.failed_payouts)} />
          </div>
        </Group>
        <Group title="Support" icon={LifeBuoy}>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Tickets" value={nf(k.support.total)} />
            <Stat label="Open" value={nf(k.support.open)} />
          </div>
        </Group>
      </div>

      <Group title="System" icon={Gauge}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Database" value={d.system.database} />
          <Stat label="Scheduler" value={d.system.scheduler} />
          <Stat label="Scoring" value={d.system.scoring_engine} />
          <Stat label="Gateway" value={d.system.payment_gateway} />
        </div>
        <p className="text-[11px] text-muted">
          Fairness rule {d.fairness.duration_rule_version} · global maximum {d.fairness.global_max_days} days ·
          {' '}{nf(k.scoring.snapshots)} score snapshots preserved.
        </p>
      </Group>

      <Group title="Recent audit events" icon={ScrollText}>
        {d.recent_audit.length === 0
          ? <p className="text-sm text-muted">No audited actions recorded yet.</p>
          : (
            <div className="space-y-1.5">
              {d.recent_audit.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                  <Badge tone={a.status === 'success' ? 'success' : 'neutral'}>{a.action}</Badge>
                  <span className="text-muted">{a.reason}</span>
                  <span className="ml-auto text-muted nums">{dateShort(a.created_date)}</span>
                </div>
              ))}
            </div>
          )}
      </Group>
    </div>
  );
}

function Contests() {
  const [rows, setRows] = useState(null);
  useEffect(() => { fn('adminContests').then((d) => setRows(d.contests || [])).catch(() => setRows([])); }, []);
  if (rows === null) return <div className="py-12 grid place-items-center"><Spinner /></div>;
  if (!rows.length) return <EmptyState icon={Target} title="No contests" description="Contests will appear here as brands publish them." />;
  return (
    <Card className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 border-b border-line">
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-4 py-2.5 font-semibold">Contest</th>
            <th className="px-3 py-2.5 font-semibold">Prize</th>
            <th className="px-3 py-2.5 font-semibold">Window</th>
            <th className="px-3 py-2.5 font-semibold">Fairness</th>
            <th className="px-3 py-2.5 font-semibold text-right">Visitors</th>
            <th className="px-3 py-2.5 font-semibold text-right">Excluded</th>
            <th className="px-3 py-2.5 font-semibold">Winner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.contest_id} className="border-b border-line last:border-0">
              <td className="px-4 py-3">
                <Link to={`/contest/${c.contest_id}`} className="font-medium text-ink hover:text-primary">{c.title}</Link>
                <p className="text-[11px] text-muted">{c.status}</p>
              </td>
              <td className="px-3 py-3 nums text-muted">{money(c.prize_amount, c.currency)}</td>
              <td className="px-3 py-3 nums text-muted">{c.min_duration_days ? `${c.min_duration_days}–${c.max_duration_days}d` : '—'}</td>
              <td className="px-3 py-3">
                <Badge tone={c.fairness_state === 'enforced' ? 'success' : 'neutral'}>
                  {c.fairness_state === 'enforced' ? 'Enforced' : 'Legacy'}
                </Badge>
              </td>
              <td className="px-3 py-3 text-right nums">{nf(c.verified_visitors)}</td>
              <td className="px-3 py-3 text-right nums text-muted">{nf(c.excluded_clicks)}</td>
              <td className="px-3 py-3">
                {c.winner_user_id
                  ? <span className="text-[12px]"><Badge tone="success">Final</Badge>{c.winner_final_score !== null && <span className="ml-1.5 nums text-muted">{c.winner_final_score}</span>}</span>
                  : <span className="text-muted text-[12px]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Traffic() {
  const [d, setD] = useState(null);
  useEffect(() => { fn('adminTraffic').then(setD).catch(() => setD({ total_events: 0, by_state: {}, risk_reasons: {}, recent: [] })); }, []);
  if (!d) return <div className="py-12 grid place-items-center"><Spinner /></div>;
  return (
    <div className="space-y-4">
      <Group title="Verification states" icon={MousePointerClick}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(d.by_state).length === 0
            ? <p className="text-sm text-muted">No traffic events recorded yet.</p>
            : Object.entries(d.by_state).map(([k, v]) => <Stat key={k} label={k} value={nf(v)} />)}
        </div>
      </Group>
      <Group title="Risk reasons (internal)" icon={ShieldCheck}>
        <p className="text-[11px] text-muted">Visible to admins only. Never surfaced to creators or brands.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(d.risk_reasons).length === 0
            ? <p className="text-sm text-muted">No excluded events.</p>
            : Object.entries(d.risk_reasons).map(([k, v]) => <Stat key={k} label={k.replace(/_/g, ' ')} value={nf(v)} />)}
        </div>
      </Group>
    </div>
  );
}

function UsersPanel() {
  const [d, setD] = useState(null);
  useEffect(() => { fn('adminUsers').then(setD).catch(() => setD(null)); }, []);
  if (!d) return <div className="py-12 grid place-items-center"><Spinner /></div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="Total" value={nf(d.total)} />
        <Stat label="Creators" value={nf(d.creators)} />
        <Stat label="Brands" value={nf(d.clients)} />
        <Stat label="Admins" value={nf(d.admins)} />
        <Stat label="Seed identities" value={nf(d.seeded)} sub="excluded from real reporting" />
      </div>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 border-b border-line">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2.5 font-semibold">Email</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-3 py-2.5 font-semibold">Role</th>
              <th className="px-3 py-2.5 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {d.users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">
                  {u.email} {u.is_seed && <Badge tone="neutral">seed</Badge>}
                </td>
                <td className="px-3 py-2.5 text-muted">{u.user_role || '—'}</td>
                <td className="px-3 py-2.5">{u.role === 'admin' ? <Badge tone="primary">admin</Badge> : <span className="text-muted">user</span>}</td>
                <td className="px-3 py-2.5 text-muted">{dateShort(u.created_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Audit() {
  const [rows, setRows] = useState(null);
  useEffect(() => { fn('adminAudit').then((d) => setRows(d.events || [])).catch(() => setRows([])); }, []);
  if (rows === null) return <div className="py-12 grid place-items-center"><Spinner /></div>;
  if (!rows.length) return <EmptyState icon={ScrollText} title="No audit events" description="Winner finalizations and other audited actions appear here." />;
  return (
    <div className="space-y-2">
      {rows.map((a) => (
        <Card key={a.id} className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={a.status === 'success' ? 'success' : 'neutral'}>{a.action}</Badge>
            <span className="text-[12px] text-muted">{a.reason}</span>
            <span className="ml-auto text-[11px] text-muted nums">{dateShort(a.created_date)}</span>
          </div>
          {a.result && <pre className="mt-2 text-[11px] text-muted whitespace-pre-wrap break-all">{a.result}</pre>}
        </Card>
      ))}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('overview');
  return (
    <div className="space-y-5">
      <PageHeader
        title="Control center"
        description="Platform operations. All actions are authorized and audited on the backend."
      />
      <Segmented value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Overview' },
        { key: 'contests', label: 'Contests' },
        { key: 'traffic', label: 'Traffic' },
        { key: 'users', label: 'Users' },
        { key: 'audit', label: 'Audit' },
      ]} />
      {tab === 'overview' && <Overview />}
      {tab === 'contests' && <Contests />}
      {tab === 'traffic' && <Traffic />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}
