import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Clock, LifeBuoy, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const STATUS = {
  open: { label: 'Under review', cls: 'bg-primary/10 text-primary', icon: Clock },
  in_review: { label: 'Under review', cls: 'bg-primary/10 text-primary', icon: Clock },
  in_progress: { label: 'Under review', cls: 'bg-primary/10 text-primary', icon: Clock },
  waiting_for_user: { label: 'Waiting for you', cls: 'bg-warning/15 text-[#D78C05]', icon: Clock },
  resolved: { label: 'Resolved', cls: 'bg-success/10 text-success', icon: CheckCircle2 },
  closed: { label: 'Closed', cls: 'bg-muted text-muted-foreground', icon: XCircle },
};

// The user's own support requests — every request raised from Help.
export default function HelpRequestsList({ onBack }) {
  const [tickets, setTickets] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    (async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me?.id) { setTickets([]); return; }
      setTickets(await base44.entities.SupportTicket.filter({ user_id: me.id }, '-created_date', 50).catch(() => []));
    })();
  }, []);

  if (tickets === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-7 h-7 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {onBack && (
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-4">
          &larr; Back to Help
        </button>
      )}

      {tickets.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <LifeBuoy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-heading font-bold mb-1">No support requests yet</p>
          <p className="text-sm text-muted-foreground">
            If anything comes up, ask a question in Help and we&rsquo;ll sort it out.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const st = STATUS[t.status] || STATUS.open;
            const StIcon = st.icon;
            const isOpen = openId === t.id;
            return (
              <div key={t.id} className="glass-card rounded-2xl overflow-hidden animate-fade-in">
                <button
                  onClick={() => setOpenId(isOpen ? null : t.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-heading text-xs font-bold text-primary">{t.ticket_id || 'RK-SUP'}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${st.cls}`}>
                        <StIcon className="w-3 h-3" /> {st.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate mt-0.5">{t.subject || 'Support request'}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.category}
                      {t.created_date ? ` · ${new Date(t.created_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                  </div>
                  {isOpen
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Your request</p>
                      <p className="text-sm text-foreground/90">{t.description}</p>
                    </div>
                    {t.admin_response && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Support response</p>
                        <p className="text-sm text-foreground/90 bg-primary/5 border border-primary/20 rounded-xl p-3">
                          {t.admin_response}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}