import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, CheckSquare, Clock, IndianRupee } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import HandoverShell from '@/components/handover/HandoverShell';
import SecurityBanner from '@/components/handover/SecurityBanner';
import { useToast } from '@/components/ui/use-toast';
import { logHandoverEvent } from '@/lib/handover-utils';

const CHECKLIST = [
  'Access / assets have been delivered to the winner.',
  'The handover is complete.',
];

// Client confirmation screen — sets client_confirmation, unlocking payment release.
export default function HandoverClientConfirm() {
  const { id } = useParams();
  return (
    <HandoverShell contestId={id} active="complete">
      {(ctx) => <ClientPanel {...ctx} />}
    </HandoverShell>
  );
}

function ClientPanel({ contest, handover, user, isClient, refresh }) {
  const { toast } = useToast();
  const [checked, setChecked] = useState([false, false]);
  const [busy, setBusy] = useState(false);

  if (!handover?.started_at) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center card-shadow">
        <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Initiate the handover first — confirmations open once it's underway.
        </p>
        {isClient && (
          <Button asChild variant="outline" className="w-full mt-4">
            <Link to={`/contest/${contest.id}/handover`}>Go to Handover Status</Link>
          </Button>
        )}
      </div>
    );
  }

  if (handover.client_confirmation) {
    return (
      <div className="bg-success/10 border border-success/30 rounded-2xl p-6 text-center">
        <Check className="w-10 h-10 text-success mx-auto mb-2" />
        <p className="font-heading font-semibold mb-1">Handover complete</p>
        <p className="text-xs text-muted-foreground mb-4">
          {handover.client_confirmed_at ? new Date(handover.client_confirmed_at).toLocaleString('en-IN') : ''} — both sides have confirmed. Payment can now be released.
        </p>
        {isClient && (
          <Button asChild className="w-full">
            <Link to={`/contest/${contest.id}/winner`}>
              <IndianRupee className="w-4 h-4 mr-2" /> Release Payment
            </Link>
          </Button>
        )}
      </div>
    );
  }

  if (!isClient) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center card-shadow">
        <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm font-medium mb-1">Waiting for the brand</p>
                  <p className="text-xs text-muted-foreground">The brand confirms the handover here once everything is delivered.</p>
      </div>
    );
  }

  if (!handover.creator_confirmation) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center card-shadow">
        <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm font-medium mb-1">Waiting for the winner</p>
        <p className="text-xs text-muted-foreground">
          The winner must confirm access before you can complete the handover.
        </p>
      </div>
    );
  }

  const allChecked = checked.every(Boolean);

  const confirm = async () => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await base44.entities.Handover.update(handover.id, {
        client_confirmation: true, client_confirmed_at: now, status: 'client_confirmed',
      });
      await logHandoverEvent(handover, { actor: 'client', actorId: user.id, action: 'client_confirmed' });
      toast({ title: 'Handover complete', description: 'You can now release the payment to the winner.' });
      refresh();
    } catch (e) {
      toast({ title: 'Could not confirm', description: 'Please try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <SecurityBanner />
      <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-primary" />
          </div>
          <h2 className="font-heading font-bold text-base">Complete the handover</h2>
        </div>
        <div className="space-y-3">
          {CHECKLIST.map((item, i) => (
            <label key={i} className="flex items-start gap-3 rounded-xl border border-border p-3.5 cursor-pointer hover:border-primary/40 transition-colors">
              <Checkbox
                checked={checked[i]}
                onCheckedChange={(v) => setChecked((prev) => prev.map((c, j) => (j === i ? !!v : c)))}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">{item}</span>
            </label>
          ))}
        </div>
      </div>
      <Button onClick={confirm} disabled={busy || !allChecked} className="w-full h-12 text-base font-semibold" size="lg">
        {busy ? 'Confirming...' : 'Complete Handover'}
      </Button>
      {!allChecked && <p className="text-xs text-muted-foreground text-center">Tick both items to complete the handover.</p>}
    </div>
  );
}