import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, ArrowLeft, Lock, Loader2, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { isAppAdmin } from '@/lib/role-utils';

const STATUS_STYLE = {
  open: 'bg-primary/10 text-primary', in_review: 'bg-amber-500/10 text-amber-600',
  waiting_for_user: 'bg-blue-500/10 text-blue-600', resolved: 'bg-success/10 text-success',
  closed: 'bg-secondary text-muted-foreground', in_progress: 'bg-amber-500/10 text-amber-600',
};

export default function AdminSupport() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const me = await base44.auth.me();
    setUser(me);
    if (!isAppAdmin(me)) { setLoading(false); return; }
    const list = await base44.entities.SupportTicket.list('-created_date', 100).catch(() => []);
    setTickets(list);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const upd = { admin_response: response };
      if (status) upd.status = status;
      const updated = await base44.entities.SupportTicket.update(selected.id, upd);
      setTickets((prev) => prev.map((t) => (t.id === selected.id ? { ...t, ...upd } : t)));
      setSelected(updated);
    } catch (e) {} finally { setSaving(false); }
  };

  const open = (t) => { setSelected(t); setResponse(t.admin_response || ''); setStatus(t.status || 'open'); };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <div className="flex items-center gap-2 mb-6">
        <Ticket className="w-6 h-6 text-primary" />
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Support Tickets</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          {tickets.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No support tickets.</p>
            : tickets.map((t) => (
              <button key={t.id} onClick={() => open(t)}
                className={`w-full text-left bg-card border rounded-xl p-3 transition-colors ${selected?.id === t.id ? 'border-primary/40' : 'border-border hover:border-primary/20'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_STYLE[t.status] || 'bg-secondary text-muted-foreground'}`}>{(t.status || '').replace('_', ' ')}</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">#{t.ticket_id} · {t.category}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{t.user_name} · {t.user_role} · {new Date(t.created_date).toLocaleDateString('en-IN')}</p>
              </button>
            ))}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground text-center py-12">Select a ticket to view details and respond.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{selected.subject}</p>
                <p className="text-[10px] text-muted-foreground font-mono">#{selected.ticket_id}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Meta label="User" value={`${selected.user_name || '—'} (${selected.user_role || '—'})`} />
                <Meta label="Category" value={selected.category} />
                <Meta label="Priority" value={selected.priority} />
                <Meta label="Status" value={(selected.status || '').replace('_', ' ')} />
                {selected.contest_id && <Meta label="Context" value={selected.contest_id} />}
                {selected.related_submission_id && <Meta label="Submission" value={selected.related_submission_id} />}
                {selected.related_transaction_id && <Meta label="Transaction" value={selected.related_transaction_id} />}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm bg-secondary/40 rounded-lg p-3 whitespace-pre-wrap">{selected.description}</p>
              </div>
              {selected.conversation_summary && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Conversation Summary</p>
                  <p className="text-xs bg-secondary/40 rounded-lg p-3 whitespace-pre-wrap">{selected.conversation_summary}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Update Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 rounded-lg border border-input bg-transparent px-3 text-sm capitalize">
                  {['open', 'in_review', 'waiting_for_user', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Response to User</label>
                <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={4} className="w-full rounded-lg border border-input bg-transparent p-3 text-sm" placeholder="Type your response…" />
              </div>
              <button onClick={save} disabled={saving} className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Save Response
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div className="bg-secondary/40 rounded-lg px-2.5 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xs font-medium truncate">{value || '—'}</p>
    </div>
  );
}