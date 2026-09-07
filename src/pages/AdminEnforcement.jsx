import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, ShieldAlert, Gavel, Loader2, Lock, ArrowLeft, X, Sparkles, Undo2, Ban } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { isAppAdmin } from '@/lib/role-utils';
import { issueWarning, dismissReport, reverseEnforcement, aiSuggestCategory, respondToAppeal } from '@/lib/enforcement-utils';

const STATUS_STYLE = {
  submitted: 'bg-primary/10 text-primary', under_review: 'bg-blue-500/10 text-blue-600',
  verified_violation: 'bg-destructive/10 text-destructive', action_taken: 'bg-destructive/10 text-destructive',
  unsubstantiated: 'bg-secondary text-muted-foreground', dismissed: 'bg-secondary text-muted-foreground',
  escalated: 'bg-amber-500/10 text-amber-600', closed: 'bg-secondary text-muted-foreground',
  open: 'bg-primary/10 text-primary', reviewing: 'bg-blue-500/10 text-blue-600', resolved: 'bg-success/10 text-success',
};
const ACC_STATUS = { active: 'bg-success/10 text-success', warning: 'bg-amber-500/10 text-amber-600', restricted: 'bg-orange-500/10 text-orange-600', suspended: 'bg-destructive/10 text-destructive', terminated: 'bg-destructive/10 text-destructive' };

const TABS = ['Reports', 'Warnings', 'Enforcement', 'Appeals', 'Fraud'];

export default function AdminEnforcement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Reports');
  const [reports, setReports] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [standings, setStandings] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [fraud, setFraud] = useState([]);
  const [users, setUsers] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [appealResp, setAppealResp] = useState(null);
  const [respText, setRespText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const me = await base44.auth.me();
    setUser(me);
    if (!isAppAdmin(me)) { setLoading(false); return; }
    const [r, w, s, f, u] = await Promise.all([
      base44.entities.Report.list('-created_date', 100).catch(() => []),
      base44.entities.Warning.list('-created_date', 100).catch(() => []),
      base44.entities.AccountStanding.list('-created_date', 100).catch(() => []),
      base44.entities.FraudAlert.list('-created_date', 50).catch(() => []),
      base44.entities.User.list('-created_date', 200).catch(() => []),
    ]);
    setReports(r); setWarnings(w); setStandings(s); setFraud(f); setUsers(u);
    const ap = await base44.entities.SupportTicket.filter({ category: 'dispute' }, '-created_date', 100).catch(() => []);
    setAppeals(ap.filter((t) => t.subject?.startsWith('Appeal')));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const userById = (id) => users.find((u) => u.id === id);
  const nameOf = (id) => { const u = userById(id); return u ? (u.full_name || u.email || id.slice(0, 6)) : (id || '—').slice(0, 8); };
  const roleOf = (id) => userById(id)?.user_role || 'editor';

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!isAppAdmin(user)) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <Lock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">You do not have permission to access this page.</p>
        <Link to="/" className="text-primary text-sm hover:underline mt-2 inline-block">Back to Home</Link>
      </div>
    );
  }

  const doConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const targetUser = userById(confirm.report.reported_user_id) || { id: confirm.report.reported_user_id, user_role: roleOf(confirm.report.reported_user_id) };
      await issueWarning({ adminUser: user, targetUser, report: confirm.report, violationType: confirm.violationType, severity: confirm.severity, reason: confirm.reason });
      await load();
      setConfirm(null);
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const doDismiss = async (report, outcome) => { setBusy(true); try { await dismissReport({ adminUser: user, report, outcome }); await load(); } finally { setBusy(false); } };
  const doReverse = async (warning) => { setBusy(true); try { await reverseEnforcement({ adminUser: user, warning, reason: 'Reversed on manual review' }); await load(); } finally { setBusy(false); } };
  const doRespond = async () => { if (!appealResp || !respText.trim()) return; setBusy(true); try { await respondToAppeal({ adminUser: user, ticket: appealResp, response: respText, outcome: 'resolved' }); setAppealResp(null); setRespText(''); await load(); } catch (e) { alert(e.message); } finally { setBusy(false); } };
  const doSuggest = async (report) => {
    setBusy(true);
    try { const s = await aiSuggestCategory(report); alert(`Suggested: ${s?.category || '?'} · ${s?.severity || '?'} · duplicate risk ${s?.duplicate_risk || '?'}`); }
    catch (e) { alert('AI suggestion failed'); } finally { setBusy(false); }
  };

  const pending = reports.filter((r) => ['submitted', 'under_review', 'open', 'reviewing'].includes(r.status));

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="w-4 h-4" /> Back</Link>
      <div className="flex items-center gap-2 mb-6">
        <ShieldAlert className="w-6 h-6 text-primary" />
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Trust & Enforcement</h1>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
      </div>

      {tab === 'Reports' && (
        <div className="space-y-2">
          {pending.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No pending reports.</p>}
          {pending.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium capitalize">{r.category?.replace('_', ' ')} · {r.target_type}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] || 'bg-secondary text-muted-foreground'}`}>{r.status}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.reason}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Reported user: {nameOf(r.reported_user_id)} · Severity {r.severity}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => setConfirm({ report: r, violationType: r.category, severity: r.severity || 'medium', reason: r.reason })} className="text-xs px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground font-medium">Confirm Violation</button>
                <button onClick={() => doDismiss(r, 'dismissed')} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-border">Dismiss</button>
                <button onClick={() => doSuggest(r)} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-border inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'Warnings' && (
        <div className="space-y-2">
          {warnings.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No warnings issued.</p>}
          {warnings.map((w) => (
            <div key={w.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">#{w.warning_number} — {w.violation_type} · {nameOf(w.user_id)}</p>
                <p className="text-xs text-muted-foreground">{w.reason} · {w.severity} · {new Date(w.created_date).toLocaleDateString('en-IN')}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${w.status === 'reversed' ? 'bg-secondary text-muted-foreground' : 'bg-amber-500/10 text-amber-600'}`}>{w.status}</span>
                {w.status === 'active' && <button onClick={() => doReverse(w)} disabled={busy} className="text-xs px-2 py-1 rounded-lg border border-border inline-flex items-center gap-1"><Undo2 className="w-3 h-3" /> Reverse</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'Enforcement' && (
        <div className="space-y-2">
          {standings.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No enforcement records.</p>}
          {standings.map((s) => (
            <div key={s.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{nameOf(s.user_id)}</p>
                <p className="text-xs text-muted-foreground capitalize">{s.role} · {s.warning_count} warnings · {new Date(s.last_updated || s.created_date).toLocaleDateString('en-IN')}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full capitalize shrink-0 ${ACC_STATUS[s.status] || 'bg-secondary text-muted-foreground'}`}>{s.status}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'Appeals' && (
        <div className="space-y-2">
          {appeals.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No appeals.</p>}
          {appeals.map((a) => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{a.subject}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[a.status] || 'bg-secondary text-muted-foreground'}`}>{a.status}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">#{a.ticket_id} · {nameOf(a.user_id)}</p>
              {a.admin_response && <p className="text-xs text-muted-foreground mt-1 border-t border-border pt-1">Response: {a.admin_response}</p>}
              {!a.admin_response && <button onClick={() => setAppealResp(a)} disabled={busy} className="text-xs px-2 py-1 rounded-lg border border-border mt-2">Respond</button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'Fraud' && (
        <div className="space-y-2">
          {fraud.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No fraud alerts.</p>}
          {fraud.map((f) => (
            <div key={f.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium capitalize">{f.alert_type?.replace('_', ' ')} · {nameOf(f.user_id)}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{f.details}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full capitalize shrink-0 ${f.status === 'blocked' ? 'bg-destructive/10 text-destructive' : f.status === 'cleared' ? 'bg-success/10 text-success' : 'bg-amber-500/10 text-amber-600'}`}>{f.status}</span>
            </div>
          ))}
        </div>
      )}

      {appealResp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setAppealResp(null)}>
          <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-border p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold">Respond to Appeal</h3>
              <button onClick={() => setAppealResp(null)} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">{appealResp.subject}</p>
            <textarea value={respText} onChange={(e) => setRespText(e.target.value)} rows={3} placeholder="Your response to the user..." className="w-full rounded-lg border border-input bg-transparent p-3 text-sm" />
            <button onClick={doRespond} disabled={busy || !respText.trim()} className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">Resolve &amp; Notify</button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setConfirm(null)}>
          <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-border p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold flex items-center gap-2"><Gavel className="w-4 h-4" /> Confirm Violation</h3>
              <button onClick={() => setConfirm(null)} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">Issue a verified warning to {nameOf(confirm.report.reported_user_id)} ({roleOf(confirm.report.reported_user_id)}). This action runs the automatic threshold + enforcement.</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={confirm.violationType} onChange={(e) => setConfirm({ ...confirm, violationType: e.target.value })} placeholder="Violation type" className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm" />
              <select value={confirm.severity} onChange={(e) => setConfirm({ ...confirm, severity: e.target.value })} className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm capitalize">
                {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <textarea value={confirm.reason} onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })} rows={3} placeholder="Reason / note to user" className="w-full rounded-lg border border-input bg-transparent p-3 text-sm" />
            <button onClick={doConfirm} disabled={busy} className="w-full h-11 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />} Issue Warning & Enforce
            </button>
          </div>
        </div>
      )}
    </div>
  );
}