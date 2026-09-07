import { useEffect, useState } from 'react';
import { CheckCircle2, LifeBuoy, Loader2 } from 'lucide-react';
import { createHelpTicket } from '@/lib/help-assistant';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';

// Human escalation — sends the conversation with full context so the user
// never repeats the issue. The assistant loop stops here.
export default function ContactSupport({ user, messages, reason, page, fromRoute, autoSend, onViewRequests }) {
  const { toast } = useToast();
  const [phase, setPhase] = useState(autoSend ? 'creating' : 'idle');
  const [ref, setRef] = useState(null);

  const send = async () => {
    setPhase('creating');
    try {
      const id = await createHelpTicket({ user, messages, reason, page, fromRoute });
      setRef(id);
      setPhase('done');
      base44.analytics.track({ eventName: 'ticket_created' });
    } catch {
      setPhase('idle');
      toast({ title: 'Could not send your request', description: 'Please try again.', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (autoSend) send();
  }, [autoSend]);

  if (phase === 'done') {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center card-shadow animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <p className="font-heading font-bold">Your request has been sent.</p>
        {ref && (
          <p className="text-xs text-muted-foreground mt-1">
            Request ID: <span className="font-semibold text-foreground">{ref}</span>
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          Support has the conversation context, so you don&rsquo;t need to repeat the issue.
        </p>
        {onViewRequests && (
          <button onClick={onViewRequests} className="mt-4 text-sm font-medium text-primary hover:underline">
            View my support requests
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 card-shadow">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Need more help?</p>
        <p className="text-xs text-muted-foreground">Send this conversation to support — no need to repeat the issue.</p>
      </div>
      <button
        onClick={send}
        disabled={phase === 'creating'}
        className="h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#0B48E8] transition-colors disabled:opacity-50 shrink-0"
      >
        {phase === 'creating' ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
        ) : (
          <><LifeBuoy className="w-4 h-4" /> Contact Support</>
        )}
      </button>
    </div>
  );
}