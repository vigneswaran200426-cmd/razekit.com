import { useState, useEffect } from 'react';
import { X, Loader2, Send, Check, IndianRupee, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { sendInvitation } from '@/lib/notification-utils';
import CountdownTimer from '@/components/CountdownTimer';

export default function InviteToContextModal({ creator, clientUser, clientProfile, onClose, onDone }) {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    base44.entities.Contest.filter({ created_by_id: clientUser.id }, '-created_date', 50)
      .then((cs) => setContests(cs.filter((c) => c.status === 'open')))
      .catch(() => setContests([]))
      .finally(() => setLoading(false));
  }, [clientUser.id]);

  const handleSend = async () => {
    if (!selected) return;
    setSending(true); setErr('');
    try {
      const res = await sendInvitation({ contest: selected, clientUser, clientProfile, creator });
      if (res.duplicate) setErr('This creator already has a pending invitation to this contest.');
      else { setDone(true); setTimeout(() => { onDone?.(); onClose(); }, 800); }
    } catch (e) { setErr(e.message || 'Failed to send invitation'); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-border max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-heading font-semibold">Invite to Contest</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 border-b border-border">
          <p className="text-xs text-muted-foreground">Inviting <span className="font-medium text-foreground">{creator.display_name || `@${creator.username}`}</span> to a contest you own.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            : contests.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">You have no open contests to invite to. <br />Publish a contest first.</p>
            : contests.map((c) => (
              <button key={c.id} onClick={() => setSelected(c)}
                className={`w-full text-left p-3 rounded-xl border transition-colors mb-1 ${selected?.id === c.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{c.title}</p>
                  {c.prize_amount != null && <span className="text-xs flex items-center text-muted-foreground shrink-0"><IndianRupee className="w-3 h-3" />{Number(c.prize_amount).toLocaleString('en-IN')}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /><CountdownTimer deadline={c.deadline} /></p>
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