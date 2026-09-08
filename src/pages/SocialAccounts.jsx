import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { SOCIAL_PROVIDERS, SOCIAL_LIVE, providerByKey } from '@/lib/social-providers';
import { summarizeConnections } from '@/lib/social-analytics';
import { X, Plus, Trash2, ShieldCheck, Info, Users, Eye, Activity, TrendingUp, Loader2 } from 'lucide-react';

const STATUS = {
  connected: { label: 'Connected', cls: 'text-success', dot: 'bg-success' },
  pending: { label: 'Pending verification', cls: 'text-amber-600', dot: 'bg-amber-500' },
  error: { label: 'Sync error', cls: 'text-destructive', dot: 'bg-destructive' },
  disconnected: { label: 'Disconnected', cls: 'text-muted-foreground', dot: 'bg-muted-foreground' },
};

function Badge({ provider }) {
  const p = providerByKey(provider);
  return <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: p?.color || '#64748b' }}>{(p?.name || provider)[0]}</span>;
}
function Kpi({ icon: Icon, label, value }) {
  return <div className="glass-card rounded-2xl p-4"><div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2"><Icon className="w-4 h-4" /></div><p className="font-heading text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}

export default function SocialAccounts() {
  const { toast } = useToast();
  const [me, setMe] = useState(null);
  const [conns, setConns] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connect, setConnect] = useState(null);
  const [form, setForm] = useState({ username: '', profile_url: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const u = await base44.auth.me().catch(() => null); setMe(u);
    if (u?.id) {
      const [c, m] = await Promise.all([
        base44.entities.SocialConnection.filter({ owner_user_id: u.id }, '-created_date', 50).catch(() => []),
        base44.entities.SocialMetric.filter({ owner_user_id: u.id }, '-metric_date', 500).catch(() => []),
      ]);
      setConns(c); setMetrics(m);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const connOf = (key) => conns.find((c) => c.provider === key && c.status !== 'disconnected');

  const submitConnect = async () => {
    if (!form.username.trim()) { toast({ title: 'Enter your username / handle', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await base44.entities.SocialConnection.create({
        owner_user_id: me.id, owner_type: me.user_role === 'client' ? 'client' : 'creator',
        provider: connect, username: form.username.trim().replace(/^@/, ''), profile_url: form.profile_url.trim(),
        status: 'pending', verified: false, public_display: true,
      });
      toast({ title: 'Account added', description: SOCIAL_LIVE ? 'Starting sync…' : 'Verified analytics activate once official API access is configured.' });
      setConnect(null); setForm({ username: '', profile_url: '' }); await load();
    } catch (e) { toast({ title: 'Could not add account', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const disconnect = async (c) => {
    try { await base44.entities.SocialConnection.update(c.id, { status: 'disconnected', verified: false }); await load(); toast({ title: 'Disconnected' }); }
    catch (e) { toast({ title: 'Could not disconnect', description: e.message, variant: 'destructive' }); }
  };

  const metricsByConn = {};
  metrics.forEach((m) => { (metricsByConn[m.social_connection_id] ||= []).push(m); });
  const activeConns = conns.filter((c) => c.status !== 'disconnected');
  const byProvider = summarizeConnections(activeConns, metricsByConn);
  const totalFollowers = Object.values(byProvider).reduce((s, p) => s + (p.followers || 0), 0);
  const totalViews = Object.values(byProvider).reduce((s, p) => s + (p.views || 0), 0);
  const hasData = metrics.length > 0;

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-10 space-y-6">
      <div>
        <h1 className="font-heading text-xl md:text-2xl font-bold tracking-tight">Social accounts</h1>
        <p className="text-sm text-muted-foreground">Connect your platforms to verify your reach and show social proof on your profile.</p>
      </div>

      {!SOCIAL_LIVE && (
        <div className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-muted-foreground">Register your accounts now. <b className="text-foreground">Verified analytics turn on once official API access is configured</b> for each platform — Razekit never scrapes and never asks for your password.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {SOCIAL_PROVIDERS.map((p) => {
          const c = connOf(p.key);
          const st = c ? (STATUS[c.status] || STATUS.pending) : null;
          return (
            <div key={p.key} className="glass-card rounded-2xl p-4 flex items-center gap-3">
              <Badge provider={p.key} />
              <div className="min-w-0 flex-1">
                <p className="font-heading font-semibold text-sm flex items-center gap-1.5">{p.name}{c?.verified && <ShieldCheck className="w-3.5 h-3.5 text-primary" />}</p>
                {c ? (
                  <p className="text-xs flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /><span className={st.cls}>{st.label}</span>{c.username && <span className="text-muted-foreground truncate">· @{c.username}</span>}</p>
                ) : <p className="text-xs text-muted-foreground">Not connected</p>}
              </div>
              {c ? (
                <button onClick={() => disconnect(c)} className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Disconnect</button>
              ) : (
                <button onClick={() => { setConnect(p.key); setForm({ username: '', profile_url: '' }); }} className="text-xs font-semibold text-primary-foreground bg-primary rounded-full px-3 py-1.5 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Connect</button>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="font-heading text-lg font-bold mb-3">Your Social Analytics</h2>
        {hasData ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi icon={Users} label="Total Followers" value={totalFollowers.toLocaleString('en-IN')} />
            <Kpi icon={Eye} label="Total Views" value={totalViews.toLocaleString('en-IN')} />
            <Kpi icon={Activity} label="Platforms" value={Object.keys(byProvider).length} />
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-8 text-center">
            <TrendingUp className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-heading font-semibold mb-1">No analytics yet</p>
            <p className="text-sm text-muted-foreground">Followers, views, engagement and growth appear here after your first verified sync.</p>
          </div>
        )}
      </div>

      {connect && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => setConnect(null)}>
          <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-heading font-bold flex items-center gap-2"><Badge provider={connect} /> Connect {providerByKey(connect)?.name}</h3>
              <button onClick={() => setConnect(null)} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="text-sm font-medium">Username / handle</label><input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="@yourhandle" className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
              <div><label className="text-sm font-medium">Profile URL (optional)</label><input value={form.profile_url} onChange={(e) => setForm((f) => ({ ...f, profile_url: e.target.value }))} placeholder="https://…" className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
              {SOCIAL_LIVE
                ? <p className="text-[11px] text-muted-foreground">You'll be redirected to {providerByKey(connect)?.name} to authorize access.</p>
                : <p className="text-[11px] text-muted-foreground flex items-start gap-1"><ShieldCheck className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" /> We never ask for your password. Official verification activates later; for now this registers your account.</p>}
              <button onClick={submitConnect} disabled={saving} className="w-full h-11 rounded-full bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2">{saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Add account'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}