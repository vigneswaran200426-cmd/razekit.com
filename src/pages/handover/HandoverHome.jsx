import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, Clock, LifeBuoy, Flag, MessageSquare, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import HandoverShell from '@/components/handover/HandoverShell';
import { useToast } from '@/components/ui/use-toast';
import {
  HANDOVER_DEADLINE_HOURS,
  HANDOVER_TYPE_OPTIONS,
  HANDOVER_TYPE_LABELS,
  HANDOVER_ITEM_OPTIONS,
  HANDOVER_STATUS_LABELS,
  parseEventLog,
  parseHandoverItems,
  isHandoverExpired,
  logHandoverEvent,
} from '@/lib/handover-utils';

export default function HandoverHome() {
  const { id } = useParams();
  return (
    <HandoverShell contestId={id} active="status">
      {(ctx) => <StatusPanel {...ctx} />}
    </HandoverShell>
  );
}

function StatusPanel({ contest, handover, user, isClient, refresh }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const canInitiate = isClient && contest.status === 'winner_selected' && (!handover || handover.status === 'not_started');

  if (canInitiate) return <InitiatePanel contest={contest} handover={handover} user={user} refresh={refresh} />;
  if (!handover) {
    return <HintCard icon={MessageSquare} title="Waiting for the brand" text="The brand will initiate the account handover after winner selection." />;
  }

  const items = parseHandoverItems(handover);
  const completed = handover.status === 'completed';
  const expired = isHandoverExpired(handover);

  const requestExtension = async () => {
    setBusy(true);
    try {
      const base = new Date(handover.deadline) > new Date() ? new Date(handover.deadline) : new Date();
      const deadline = new Date(base.getTime() + HANDOVER_DEADLINE_HOURS * 3600 * 1000).toISOString();
      await base44.entities.Handover.update(handover.id, { deadline });
      await logHandoverEvent(handover, {
        actor: isClient ? 'client' : 'creator', actorId: user.id, action: 'extension_requested',
      });
      toast({ title: 'Deadline extended', description: `${HANDOVER_DEADLINE_HOURS} more hours added.` });
      refresh();
    } finally { setBusy(false); }
  };

  const reportProblem = async () => {
    setBusy(true);
    try {
      await base44.entities.SupportTicket.create({
        user_id: user.id, user_name: user.full_name || user.email, user_email: user.email,
        user_role: isClient ? 'client' : 'creator', category: 'dispute',
        subject: `Handover problem — ${contest.title}`,
        description: `A problem was reported during the account handover for "${contest.title}". Current handover status: ${handover.status}.`,
        conversation_summary: '', contest_id: contest.id,
        ticket_id: `HOV-${Date.now().toString(36).toUpperCase()}`,
        status: 'open', priority: 'high',
      }).catch(() => {});
      await logHandoverEvent(handover, {
        actor: isClient ? 'client' : 'creator', actorId: user.id, action: 'problem_reported',
      });
      toast({ title: 'Problem reported', description: 'Our support team will follow up shortly.' });
      refresh();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Handover</p>
          <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-secondary text-muted-foreground">
            {HANDOVER_STATUS_LABELS[handover.status] || handover.status}
          </span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Type</span>
            <span className="font-medium text-right">{HANDOVER_TYPE_LABELS[handover.handover_type] || handover.handover_type}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Started</span>
            <span className="font-medium">{handover.started_at ? new Date(handover.started_at).toLocaleString('en-IN') : '—'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Deadline</span>
            <span className="font-medium">{handover.deadline ? new Date(handover.deadline).toLocaleString('en-IN') : '—'}</span>
          </div>
        </div>
        {items.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {items.map((it) => (
              <span key={it} className="text-[11px] px-2 py-1 rounded-lg bg-primary/10 text-primary font-medium">{it}</span>
            ))}
          </div>
        )}
      </div>

      {/* Stage timeline */}
      <Timeline handover={handover} contest={contest} />

      {completed && (
        <div className="bg-success/10 border border-success/30 rounded-2xl p-5 text-center">
          <Check className="w-8 h-8 text-success mx-auto mb-2" />
          <p className="font-heading font-semibold mb-1">Handover completed</p>
          <p className="text-xs text-muted-foreground mb-4">Payment has been released and this contest is done.</p>
          <Button asChild className="w-full"><Link to={`/contest/${contest.id}/completed`}>View summary</Link></Button>
        </div>
      )}

      {!completed && handover.status === 'not_started' && (
        <HintCard icon={Clock} title="Not started yet" text="The brand initiates the handover — a 24-hour window starts once it's initiated." />
      )}

      {!completed && expired && (
        <div className="bg-card border border-amber-500/30 rounded-2xl p-5 card-shadow">
          <p className="font-heading font-semibold mb-1">The 24-hour handover window has passed</p>
          <p className="text-xs text-muted-foreground mb-4">Nothing happens automatically — pick how you'd like to proceed.</p>
          <div className="space-y-2">
            <Button onClick={requestExtension} disabled={busy} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" /> Request extension (+{HANDOVER_DEADLINE_HOURS}h)
            </Button>
            <Button onClick={reportProblem} disabled={busy} variant="outline" className="w-full">
              <Flag className="w-4 h-4 mr-2" /> Report problem
            </Button>
            <Button asChild variant="ghost" className="w-full text-muted-foreground">
              <Link to="/help" state={{ from: `/contest/${contest.id}/handover` }}><LifeBuoy className="w-4 h-4 mr-2" /> Help</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Timeline({ handover, contest }) {
  const events = parseEventLog(handover);
  const timeFor = (action) => events.find((e) => e.action === action)?.time || null;
  const rows = [
    { label: 'Winner selected', time: timeFor('winner_selected') || contest.winner_selected_at, done: true },
    { label: 'Handover initiated', time: handover.started_at, done: !!handover.started_at },
    {
      label: 'Access granted / Assets delivered',
      time: timeFor('message_posted'),
      done: ['in_progress', 'winner_confirmed', 'client_confirmed', 'completed'].includes(handover.status),
    },
    { label: 'Winner confirms access', time: handover.creator_confirmed_at, done: !!handover.creator_confirmation },
    { label: 'Brand confirms handover', time: handover.client_confirmed_at, done: !!handover.client_confirmation },
    { label: 'Payment released', time: timeFor('payment_released'), done: !!handover.completed_at },
    { label: 'Handover closed', time: timeFor('completed') || handover.completed_at, done: handover.status === 'completed' },
  ];
  return (
    <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Progress</p>
      <div className="space-y-0">
        {rows.map((r, i) => (
          <div key={r.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${r.done ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}`}>
                {r.done ? <Check className="w-3.5 h-3.5" /> : <span className="text-[9px] font-bold">{i + 1}</span>}
              </div>
              {i < rows.length - 1 && <div className={`w-0.5 flex-1 min-h-[18px] ${r.done && rows[i + 1].done ? 'bg-primary/60' : 'bg-border'}`} />}
            </div>
            <div className="pb-4">
              <p className={`text-sm leading-6 ${r.done ? 'font-medium' : 'text-muted-foreground'}`}>{r.label}</p>
              {r.time && <p className="text-[10px] text-muted-foreground">{new Date(r.time).toLocaleString('en-IN')}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InitiatePanel({ contest, handover, user, refresh }) {
  const { toast } = useToast();
  const [type, setType] = useState('both');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const toggle = (it) => setItems((prev) => (prev.includes(it) ? prev.filter((x) => x !== it) : [...prev, it]));

  const initiate = async () => {
    setBusy(true);
    try {
      const now = new Date();
      const log = [
        { actor: 'system', actor_id: '', action: 'winner_selected', detail: '', time: contest.winner_selected_at || now.toISOString() },
        { actor: 'client', actor_id: user.id, action: 'initiated', detail: '', time: now.toISOString() },
      ];
      const payload = {
        contest_id: contest.id, contest_title: contest.title,
        client_id: contest.created_by_id, winner_id: contest.winner_user_id,
        handover_type: type, status: 'initiated',
        handover_items: JSON.stringify(items),
        started_at: now.toISOString(),
        deadline: new Date(now.getTime() + HANDOVER_DEADLINE_HOURS * 3600 * 1000).toISOString(),
        event_log: JSON.stringify(log),
      };
      if (handover) await base44.entities.Handover.update(handover.id, payload);
      else await base44.entities.Handover.create(payload);
      toast({ title: 'Handover initiated', description: `The winner has a ${HANDOVER_DEADLINE_HOURS}-hour window to confirm access.` });
      refresh();
    } catch (e) {
      toast({ title: 'Could not initiate handover', description: 'Please try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">What's being handed over?</p>
        <div className="space-y-2">
          {HANDOVER_TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setType(o.value)}
              className={`w-full text-left rounded-xl border p-3.5 transition-colors ${
                type === o.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              }`}
            >
              <p className="text-sm font-semibold">{o.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{o.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Handover items (optional)</p>
        <div className="flex flex-wrap gap-2">
          {HANDOVER_ITEM_OPTIONS.map((it) => (
            <button
              key={it}
              onClick={() => toggle(it)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                items.includes(it)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              {it}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={initiate} disabled={busy} className="w-full h-12 text-base font-semibold" size="lg">
        {busy ? 'Initiating…' : 'Initiate handover'}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        A {HANDOVER_DEADLINE_HOURS}-hour handover window starts now. Read the Guide first — access is granted through managed invites, never shared credentials.
      </p>
    </div>
  );
}

function HintCard({ icon: Icon, title, text }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 text-center card-shadow">
      <Icon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
      <p className="font-medium text-sm mb-1">{title}</p>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}