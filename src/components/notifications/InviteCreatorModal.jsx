import { useState, useEffect } from 'react';
import { Search, X, Send, Loader2, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { sendInvitation } from '@/lib/notification-utils';

export default function InviteCreatorModal({ contest, user, onClose }) {
  const [query, setQuery] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    base44.entities.UserProfile.list('-created_date', 100)
      .then((p) => setProfiles(p.filter((x) => x.user_id && x.user_id !== user.id)))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, [user.id]);

  const filtered = profiles.filter((p) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return `${p.username || ''} ${p.display_name || ''} ${p.professional_title || ''}`.toLowerCase().includes(q);
  }).slice(0, 30);

  const handleSend = async () => {
    if (!selected) return;
    setSending(true); setErr('');
    try {
      const clientProfile = profiles.find((p) => p.user_id === user.id) || null;
      const res = await sendInvitation({ contest, clientUser: user, clientProfile, creator: selected });
      if (res.duplicate) setErr('This creator already has a pending invitation to this contest.');
      else { setDone(true); setTimeout(onClose, 800); }
    } catch (e) { setErr(e.message || 'Failed to send invitation'); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-border max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-heading font-semibold">Invite a Creator</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 border-b border-border">
          <p className="text-xs text-muted-foreground mb-2">Contest · <span className="font-medium text-foreground">{contest.title}</span></p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or username"
              className="w-full h-10 rounded-lg border border-input bg-transparent pl-9 pr-3 text-sm" autoFocus />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            : filtered.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">No creators found.</p>
            : filtered.map((p) => (
              <button key={p.id} onClick={() => setSelected(p)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors ${selected?.id === p.id ? 'bg-primary/10' : 'hover:bg-secondary/60'}`}>
                <div className="w-9 h-9 rounded-full bg-secondary overflow-hidden shrink-0 flex items-center justify-center">
                  {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" />
                    : <span className="text-xs text-muted-foreground font-medium">{(p.display_name || p.username || '?')[0]}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.display_name || p.username}</p>
                  <p className="text-xs text-muted-foreground truncate">@{p.username}{p.professional_title ? ` · ${p.professional_title}` : ''}</p>
                </div>
                {selected?.id === p.id && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            ))}
        </div>
        <div className="p-4 border-t border-border">
          {err && <p className="text-xs text-destructive mb-2">{err}</p>}
          <button onClick={handleSend} disabled={!selected || sending || done}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {done ? <><Check className="w-4 h-4" /> Invitation sent</> : sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Send Invitation</>}
          </button>
        </div>
      </div>
    </div>
  );
}