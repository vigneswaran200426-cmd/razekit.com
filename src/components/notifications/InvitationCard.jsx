import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Check, X, Loader2, ExternalLink } from 'lucide-react';
import { acceptInvitation, declineInvitation } from '@/lib/notification-utils';

export default function InvitationCard({ n }) {
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState(n.invitation_status || 'pending');
  const [err, setErr] = useState('');

  const onAccept = async () => {
    setBusy('accept'); setErr('');
    try { await acceptInvitation(n); setStatus('accepted'); }
    catch (e) { setErr(e.message || 'Could not accept — you may not be eligible to join.'); }
    finally { setBusy(''); }
  };
  const onDecline = async () => {
    setBusy('decline'); setErr('');
    try { await declineInvitation(n); setStatus('declined'); }
    catch (e) { setErr(e.message || 'Could not decline.'); }
    finally { setBusy(''); }
  };

  return (
    <div className={`flex gap-3 rounded-xl p-3.5 border ${status === 'pending' ? 'border-primary/20 bg-primary/[0.03]' : 'border-border bg-card opacity-70'}`}>
      <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
        <Mail className="w-4 h-4 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{n.title}</p>
        {n.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.description}</p>}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {status === 'pending' ? (
            <>
              <button onClick={onAccept} disabled={!!busy} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
                {busy === 'accept' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Accept
              </button>
              <button onClick={onDecline} disabled={!!busy} className="h-8 px-3 rounded-lg border border-border text-xs font-medium flex items-center gap-1 disabled:opacity-50">
                {busy === 'decline' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Decline
              </button>
              <Link to={`/contest/${n.contest_id}`} className="h-8 px-2.5 rounded-lg text-xs font-medium text-primary flex items-center gap-1">
                <ExternalLink className="w-3.5 h-3.5" /> View
              </Link>
            </>
          ) : (
            <span className={`text-xs font-medium ${status === 'accepted' ? 'text-success' : 'text-muted-foreground'}`}>
              {status === 'accepted' ? 'Invitation accepted' : 'Invitation declined'}
            </span>
          )}
        </div>
        {err && <p className="text-xs text-destructive mt-1.5">{err}</p>}
      </div>
    </div>
  );
}