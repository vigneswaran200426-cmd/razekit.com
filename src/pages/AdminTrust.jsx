import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { computeCreatorRisk } from '@/lib/risk-engine';
import { issueWarning } from '@/lib/enforcement-utils';
import { formatPrize } from '@/lib/utils';
import {
  Shield, AlertTriangle, Users, Activity, Wallet, X, Check, Eye, Gavel, ShieldAlert, FolderSearch, Ban,
} from 'lucide-react';

const TABS = [
  { k: 'overview', label: 'Overview' }, { k: 'alerts', label: 'Fraud Alerts' },
  { k: 'creators', label: 'Creator Risk' }, { k: 'payouts', label: 'Payout Holds' },
  { k: 'investigations', label: 'Investigations' }, { k: 'social', label: 'Social' },
];
const toneCls = { destructive: 'bg-destructive/10 text-destructive', amber: 'bg-amber-500/10 text-amber-600', success: 'bg-success/10 text-success' };
const sevCls = { critical: 'bg-destructive/10 text-destructive', high: 'bg-amber-500/10 text-amber-600', medium: 'bg-primary/10 text-primary', low: 'bg-secondary text-muted-foreground' };
const groupBy = (rows, key) => rows.reduce((m, r) => { const k = r[key]; if (k) (m[k] ||= []).push(r); return m; }, {});

export default function AdminTrust() {
  const { toast } = useToast();
  const [tab, setTab] = useState('overview');
  const [me, setMe] = useState(null);
  const [db, setDb] = useState(null);
  const [detail, setDetail] = useState(null); // { user, risk, signals }
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const u = await base44.auth.me().catch(() => null); setMe(u);
    const [users, fraudAlerts, reports, warnings, standings, withdrawals, payments, investigations, socialConns, contests] = await Promise.all([
      base44.entities.User.list('-created_date', 500).catch(() => []),
      base44.entities.FraudAlert.list('-created_date', 500).catch(() => []),
      base44.entities.Report.list('-created_date', 500).catch(() => []),
      base44.entities.Warning.list('-created_date', 500).catch(() => []),
      base44.entities.AccountStanding.list('-created_date', 500).catch(() => []),
      base44.entities.WithdrawalRequest.list('-created_date', 300).catch(() => []),
      base44.entities.PaymentTransaction.list('-created_date', 500).catch(() => []),
      base44.entities.FraudInvestigation.list('-created_date', 200).catch(() => []),
      base44.entities.SocialConnection.list('-created_date', 500).catch(() => []),
      base44.entities.Contest.list('-created_date', 400).catch(() => []),
    ]);
    setDb({ users, fraudAlerts, reports, warnings, standings, withdrawals, payments, investigations, socialConns, contests });
  };
  useEffect(() => { load(); }, []);

  const model = useMemo(() => {
    if (!db) return null;
    const userMap = Object.fromEntries(db.users.map((u) => [u.id, u]));
    const faBy = groupBy(db.fraudAlerts, 'user_id');
    const repBy = groupBy(db.reports, 'reported_user_id');
    const warnBy = groupBy(db.warnings, 'user_id');
    const payBy = groupBy(db.payments, 'user_id');
    const wdBy = groupBy(db.withdrawals, 'user_id');
    const socBy = groupBy(db.socialConns, 'owner_user_id');
    const standBy = Object.fromEntries(db.standings.map((s) => [s.user_id, s]));
    const winsBy = {}; db.contests.forEach((c) => { if (c.winner_user_id) winsBy[c.winner_user_id] = (winsBy[c.winner_user_id] || 0) + 1; });

    const creators = db.users.filter((u) => ['creator', 'editor', 'client'].includes(u.user_role));
    const risks = creators.map((u) => {
      const signals = {
        fraudAlerts: faBy[u.id] || [], reports: repBy[u.id] || [], warnings: (warnBy[u.id] || []).filter((w) => w.status === 'active').length,
        standingStatus: standBy[u.id]?.status, payments: payBy[u.id] || [], withdrawals: wdBy[u.id] || [],
        wins: winsBy[u.id] || 0, socialConnections: socBy[u.id] || [],
      };
      return { user: u, risk: computeCreatorRisk(signals), signals, standing: standBy[u.id] };
    }).sort((a, b) => b.risk.score - a.risk.score);

    return { userMap, risks };
  }, [db]);

  const nameOf = (id) => model?.userMap[id]?.full_name || model?.userMap[id]?.email || `User #${id?.slice(-4)?.toUpperCase() || '—'}`;

  const audit = (action, targetId, reason, result) => base44.entities.AuditLog.create({ user_id: targetId || '', action, actor: me?.id || 'admin', reason: reason || '', result: result || '' }).catch(() => {});

  const act = async (fn, okMsg) => { setBusy(true); try { await fn(); toast({ title: okMsg }); await load(); } catch (e) { toast({ title: 'Action failed', description: e.message, variant: 'destructive' }); } finally { setBusy(false); } };

  const clearAlert = (a) => act(async () => { await base44.entities.FraudAlert.update(a.id, { status: 'cleared' }); await audit('fraud_alert_cleared', a.user_id, a.alert_type, 'cleared'); }, 'Alert cleared');
  const reviewAlert = (a) => act(async () => { await base44.entities.FraudAlert.update(a.id, { status: 'reviewing' }); await audit('fraud_alert_reviewing', a.user_id, a.alert_type, 'reviewing'); }, 'Marked reviewing');

  const openInvestigation = (row) => act(async () => {
    await base44.entities.FraudInvestigation.create({
      subject_user_id: row.user.id, creator_id: row.user.id, reason: `Risk ${row.risk.score}/100 — ${row.risk.reasons.slice(0, 3).map((r) => r.label).join('; ')}`,
      risk_score: row.risk.score, severity: row.risk.level.toLowerCase() === 'critical' ? 'critical' : row.risk.score >= 50 ? 'high' : 'medium',
      status: 'OPEN', assigned_admin: me?.id || '', evidence: JSON.stringify(row.risk.reasons),
    });
    await audit('investigation_opened', row.user.id, `risk ${row.risk.score}`, 'OPEN');
  }, 'Investigation opened');

  const flagRestrict = (row) => act(async () => {
    await issueWarning({ adminUser: me, targetUser: row.user, violationType: 'trust_risk', severity: row.risk.level.toLowerCase() === 'critical' ? 'critical' : 'high', reason: `Elevated risk (${row.risk.score}/100): ${row.risk.reasons.slice(0, 2).map((r) => r.label).join('; ')}` });
  }, 'Creator flagged & restricted');

  const holdPayout = (w) => act(async () => {
    await base44.entities.FraudInvestigation.create({ subject_user_id: w.user_id, reason: `Payout hold — withdrawal ${formatPrize(w.amount, 'INR')}`, risk_score: 0, severity: 'high', status: 'ACTION_REQUIRED', assigned_admin: me?.id || '' });
    await audit('payout_held', w.user_id, `withdrawal ${w.id}`, 'held');
  }, 'Payout held (investigation opened)');
  const rejectPayout = (w) => act(async () => { await base44.entities.WithdrawalRequest.update(w.id, { status: 'failed', rejection_reason: 'Held by Trust & Safety review' }); await audit('payout_rejected', w.user_id, `withdrawal ${w.id}`, 'failed'); }, 'Payout rejected');
  const setInvStatus = (inv, status) => act(async () => { await base44.entities.FraudInvestigation.update(inv.id, { status, resolved_at: ['RESOLVED', 'DISMISSED'].includes(status) ? new Date().toISOString() : null }); await audit('investigation_' + status.toLowerCase(), inv.subject_user_id, inv.reason, status); }, `Investigation ${status}`);

  if (me && me.role !== 'admin') return <div className="p-10 text-center"><Shield className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" /><p className="font-heading font-bold">403 — Admin only</p><p className="text-sm text-muted-foreground">Trust & Safety is restricted to Razekit admins.</p></div>;
  if (!db || !model) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;

  const openAlerts = db.fraudAlerts.filter((a) => ['flagged', 'reviewing'].includes(a.status));
  const highRisk = model.risks.filter((r) => r.risk.score >= 50);
  const critical = model.risks.filter((r) => r.risk.score >= 80);
  const payoutHolds = db.withdrawals.filter((w) => ['pending', 'processing'].includes(w.status));
  const openInv = db.investigations.filter((i) => !['RESOLVED', 'DISMISSED'].includes(i.status));

  const Kpi = ({ icon: Icon, label, value, tone }) => (
    <div className="glass-card rounded-2xl p-4"><div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${tone || 'bg-primary/10 text-primary'}`}><Icon className="w-4 h-4" /></div><p className="font-heading text-2xl font-bold leading-none">{value}</p><p className="text-xs text-muted-foreground mt-1">{label}</p></div>
  );
  const RiskBadge = ({ risk }) => <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${toneCls[risk.tone]}`}>{risk.level} · {risk.score}</span>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-10">
      <div className="flex items-center gap-2 mb-1"><Shield className="w-6 h-6 text-primary" /><h1 className="font-heading text-2xl md:text-3xl font-bold">Trust &amp; Safety</h1></div>
      <p className="text-sm text-muted-foreground mb-5">Internal risk intelligence — admin only. Detection surfaces risk; actions stay with you.</p>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-5">
        {TABS.map((t) => <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${tab === t.k ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>{t.label}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={AlertTriangle} label="Open Fraud Alerts" value={openAlerts.length} tone="bg-amber-500/10 text-amber-600" />
            <Kpi icon={ShieldAlert} label="High Risk Creators" value={highRisk.length} tone="bg-amber-500/10 text-amber-600" />
            <Kpi icon={Ban} label="Critical Risk" value={critical.length} tone="bg-destructive/10 text-destructive" />
            <Kpi icon={Wallet} label="Payout Holds" value={payoutHolds.length} />
            <Kpi icon={FolderSearch} label="Open Investigations" value={openInv.length} />
            <Kpi icon={Users} label="Monitored Creators" value={model.risks.length} />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold mb-3">Top risk creators</h2>
            <div className="glass-card rounded-2xl divide-y divide-border/60">
              {model.risks.filter((r) => r.risk.score > 0).slice(0, 8).map((row) => (
                <button key={row.user.id} onClick={() => setDetail(row)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">{nameOf(row.user.id)[0]?.toUpperCase()}</div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{nameOf(row.user.id)}</p><p className="text-xs text-muted-foreground truncate">{row.risk.reasons[0]?.label || 'No active signals'}</p></div>
                  <RiskBadge risk={row.risk} />
                </button>
              ))}
              {model.risks.every((r) => r.risk.score === 0) && <p className="text-sm text-muted-foreground p-6 text-center">No elevated risk detected across creators.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'alerts' && (
        <div className="glass-card rounded-2xl divide-y divide-border/60">
          {db.fraudAlerts.length ? db.fraudAlerts.map((a) => (
            <div key={a.id} className="p-3 flex items-center gap-3">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sevCls[a.severity] || sevCls.low}`}>{a.severity}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{a.alert_type?.replace(/_/g, ' ')} · {nameOf(a.user_id)}</p><p className="text-xs text-muted-foreground truncate">{a.details || '—'}</p></div>
              <span className="text-xs text-muted-foreground capitalize shrink-0">{a.status}</span>
              {['flagged', 'reviewing'].includes(a.status) && (
                <div className="flex gap-1 shrink-0">
                  {a.status === 'flagged' && <button disabled={busy} onClick={() => reviewAlert(a)} className="text-xs px-2 py-1 rounded-full border border-border">Review</button>}
                  <button disabled={busy} onClick={() => clearAlert(a)} className="text-xs px-2 py-1 rounded-full bg-success/10 text-success inline-flex items-center gap-1"><Check className="w-3 h-3" /> Clear</button>
                </div>
              )}
            </div>
          )) : <p className="text-sm text-muted-foreground p-6 text-center">No fraud alerts.</p>}
        </div>
      )}

      {tab === 'creators' && (
        <div className="glass-card rounded-2xl divide-y divide-border/60">
          {model.risks.map((row) => (
            <button key={row.user.id} onClick={() => setDetail(row)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">{nameOf(row.user.id)[0]?.toUpperCase()}</div>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{nameOf(row.user.id)} <span className="text-xs text-muted-foreground">· {row.user.user_role}</span></p><p className="text-xs text-muted-foreground truncate">Trust {row.risk.trust} · {row.risk.reasons.length} signal(s)</p></div>
              <RiskBadge risk={row.risk} />
              <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {tab === 'payouts' && (
        <div className="glass-card rounded-2xl divide-y divide-border/60">
          {payoutHolds.length ? payoutHolds.map((w) => {
            const row = model.risks.find((r) => r.user.id === w.user_id);
            return (
              <div key={w.id} className="p-3 flex items-center gap-3">
                <Wallet className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{formatPrize(w.amount, 'INR')} · {w.user_name || nameOf(w.user_id)}</p><p className="text-xs text-muted-foreground capitalize">{w.status}</p></div>
                {row && <RiskBadge risk={row.risk} />}
                <div className="flex gap-1 shrink-0">
                  <button disabled={busy} onClick={() => holdPayout(w)} className="text-xs px-2 py-1 rounded-full border border-border">Hold</button>
                  <button disabled={busy} onClick={() => rejectPayout(w)} className="text-xs px-2 py-1 rounded-full bg-destructive/10 text-destructive">Reject</button>
                </div>
              </div>
            );
          }) : <p className="text-sm text-muted-foreground p-6 text-center">No pending payouts to review.</p>}
        </div>
      )}

      {tab === 'investigations' && (
        <div className="glass-card rounded-2xl divide-y divide-border/60">
          {db.investigations.length ? db.investigations.map((inv) => (
            <div key={inv.id} className="p-3 flex items-center gap-3">
              <FolderSearch className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{nameOf(inv.subject_user_id)} · {inv.severity}</p><p className="text-xs text-muted-foreground truncate">{inv.reason}</p></div>
              <span className="text-xs text-muted-foreground shrink-0">{inv.status}</span>
              {!['RESOLVED', 'DISMISSED'].includes(inv.status) && (
                <div className="flex gap-1 shrink-0">
                  <button disabled={busy} onClick={() => setInvStatus(inv, 'RESOLVED')} className="text-xs px-2 py-1 rounded-full bg-success/10 text-success">Resolve</button>
                  <button disabled={busy} onClick={() => setInvStatus(inv, 'DISMISSED')} className="text-xs px-2 py-1 rounded-full border border-border">Dismiss</button>
                </div>
              )}
            </div>
          )) : <p className="text-sm text-muted-foreground p-6 text-center">No investigations open.</p>}
        </div>
      )}

      {tab === 'social' && (
        <div>
          <div className="glass-card rounded-2xl divide-y divide-border/60">
            {db.socialConns.length ? db.socialConns.map((c) => (
              <div key={c.id} className="p-3 flex items-center gap-3">
                <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{nameOf(c.owner_user_id)} · {c.provider}</p><p className="text-xs text-muted-foreground truncate">@{c.username || '—'} · {c.status}</p></div>
                {c.verified ? <span className="text-[10px] text-success">verified</span> : <span className="text-[10px] text-muted-foreground">unverified</span>}
              </div>
            )) : <p className="text-sm text-muted-foreground p-6 text-center">No social accounts connected yet.</p>}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Social anomaly signals activate once official-API sync is live; connections above are creator-registered.</p>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => setDetail(null)}>
          <div className="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-border max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div><h3 className="font-heading font-bold">{nameOf(detail.user.id)}</h3><p className="text-xs text-muted-foreground">{detail.user.user_role} · Trust {detail.risk.trust}/100</p></div>
              <button onClick={() => setDetail(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`px-3 py-2 rounded-xl font-heading font-bold ${toneCls[detail.risk.tone]}`}>{detail.risk.level} · {detail.risk.score}/100</div>
                <p className="text-xs text-muted-foreground">Risk score from {detail.risk.reasons.length} signal(s)</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Signals</p>
                {detail.risk.reasons.length ? (
                  <ul className="space-y-1.5">{detail.risk.reasons.map((r, i) => <li key={i} className="flex items-center justify-between text-sm"><span className="text-foreground/90">{r.label}</span><span className="text-xs text-muted-foreground">+{r.points}</span></li>)}</ul>
                ) : <p className="text-sm text-muted-foreground">No active risk signals — evidence-based, not a judgement.</p>}
              </div>
              <p className="text-[11px] text-muted-foreground">Detection surfaces patterns for review; it does not conclude wrongdoing. Actions below are logged to the audit trail.</p>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => openInvestigation(detail)} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold"><FolderSearch className="w-4 h-4" /> Open investigation</button>
                <button disabled={busy} onClick={() => flagRestrict(detail)} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-destructive/10 text-destructive text-sm font-semibold"><Gavel className="w-4 h-4" /> Flag &amp; restrict</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
