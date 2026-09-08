import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, Clock, LifeBuoy, Flag, MessageSquare, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import HandoverShell from '@/components/handover/HandoverShell';
import { useToast } from '@/components/ui/use-toast';
import WorkflowSteps from '@/components/redesign/WorkflowSteps';
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

const FLOW = [{ label: 'Winner' }, { label: 'Requirements' }, { label: 'Verification' }, { label: 'Transfer' }, { label: 'Complete' }];

export default function HandoverHome() {
  const { id } = useParams();
  return <HandoverShell contestId={id} active="status">{(ctx) => <StatusPanel {...ctx} />}</HandoverShell>;
}

function StatusPanel({ contest, handover, user, isClient, refresh }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const canInitiate = isClient && contest.status === 'winner_selected' && (!handover || handover.status === 'not_started');
  if (canInitiate) return <InitiatePanel contest={contest} handover={handover} user={user} refresh={refresh} />;
  if (!handover) return <HintCard icon={MessageSquare} title="Waiting for the brand" text="The brand must initiate the managed handover after winner selection." />;

  const items = parseHandoverItems(handover);
  const completed = handover.status === 'completed';
  const expired = isHandoverExpired(handover);
  const stageIndex = completed ? 4 : handover.status === 'client_confirmed' || handover.status === 'winner_confirmed' ? 3 : handover.status === 'in_progress' || handover.status === 'initiated' ? 1 : 0;

  const requestExtension = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const base = handover.deadline && new Date(handover.deadline) > new Date() ? new Date(handover.deadline) : new Date();
      const deadline = new Date(base.getTime() + HANDOVER_DEADLINE_HOURS * 3600 * 1000).toISOString();
      await base44.entities.Handover.update(handover.id, { deadline });
      await logHandoverEvent(handover, { actor: isClient ? 'client' : 'creator', actorId: user.id, action: 'extension_requested' });
      toast({ title: 'Extension requested', description: `${HANDOVER_DEADLINE_HOURS} hours were added to the current window.` });
      refresh();
    } catch (e) {
      toast({ title: 'Could not extend handover', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const reportProblem = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await base44.entities.SupportTicket.create({
        user_id: user.id, user_name: user.full_name || user.email, user_email: user.email,
        user_role: isClient ? 'client' : 'creator', category: 'dispute', subject: `Handover problem — ${contest.title}`,
        description: `Problem reported during handover. Current status: ${handover.status}.`, conversation_summary: '', contest_id: contest.id,
        ticket_id: `HOV-${Date.now().toString(36).toUpperCase()}`, status: 'open', priority: 'high',
      });
      await logHandoverEvent(handover, { actor: isClient ? 'client' : 'creator', actorId: user.id, action: 'problem_reported' });
      toast({ title: 'Problem reported', description: 'Support will follow up and the handover history has been updated.' });
      refresh();
    } catch (e) {
      toast({ title: 'Could not report the problem', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <WorkflowSteps steps={FLOW} current={stageIndex} />

      <section className="surface-2 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-primary">Managed ownership transfer</p><h1 className="mt-1 font-heading text-xl md:text-2xl font-bold tracking-tight">{contest.title}</h1></div>
          <span className="rz-status rz-status--info">{HANDOVER_STATUS_LABELS[handover.status] || handover.status}</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-5">
          <Stat label="Type" value={HANDOVER_TYPE_LABELS[handover.handover_type] || handover.handover_type || 'Managed'} />
          <Stat label="Started" value={handover.started_at ? new Date(handover.started_at).toLocaleString('en-IN') : 'Not started'} />
          <Stat label="Deadline" value={handover.deadline ? new Date(handover.deadline).toLocaleString('en-IN') : '—'} />
        </div>
        {items.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{items.map((item) => <span key={item} className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-medium">{item}</span>)}</div>}
      </section>

      <Timeline handover={handover} contest={contest} />

      {completed && <section className="surface border-success/30 p-5 text-center"><Check className="w-8 h-8 text-success mx-auto mb-2" /><p className="font-heading font-semibold">Handover completed</p><p className="text-sm text-muted-foreground mt-1">The ownership transfer is closed. Payment can now follow the configured release path.</p><Button asChild className="rz-primary-action mt-4 w-full"><Link to={`/contest/${contest.id}/completed`}>View completion</Link></Button></section>}

      {!completed && handover.status === 'not_started' && <HintCard icon={Clock} title="Waiting to start" text={`The brand will initiate this managed transfer. The ${HANDOVER_DEADLINE_HOURS}-hour window begins only after initiation.`} />}

      {!completed && expired && <section className="surface border-amber-500/30 p-5"><p className="font-heading font-semibold">Handover window expired</p><p className="text-sm text-muted-foreground mt-1">The deadline passed without a completed transfer. Nothing is silently lost; choose a recovery path.</p><div className="grid sm:grid-cols-2 gap-2 mt-4"><Button onClick={requestExtension} disabled={busy} className="rz-primary-action"><RotateCcw className="w-4 h-4 mr-2" /> Request extension</Button><Button onClick={reportProblem} disabled={busy} variant="outline" className="rz-danger-action"><Flag className="w-4 h-4 mr-2" /> Report problem</Button></div><Button asChild variant="ghost" className="mt-2 w-full"><Link to="/help" state={{ from: `/contest/${contest.id}/handover` }}><LifeBuoy className="w-4 h-4 mr-2" /> Open help</Link></Button></section>}
    </div>
  );
}

function Stat({ label, value }) { return <div className="surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold leading-5">{value}</p></div>; }

function Timeline({ handover, contest }) {
  const events = parseEventLog(handover);
  const timeFor = (action) => events.find((e) => e.action === action)?.time || null;
  const rows = [
    { label: 'Winner selected', time: timeFor('winner_selected') || contest.winner_selected_at, done: true },
    { label: 'Handover initiated', time: handover.started_at, done: !!handover.started_at },
    { label: 'Access / assets delivered', time: timeFor('message_posted'), done: ['in_progress', 'winner_confirmed', 'client_confirmed', 'completed'].includes(handover.status) },
    { label: 'Winner confirms', time: handover.creator_confirmed_at, done: !!handover.creator_confirmation },
    { label: 'Brand confirms', time: handover.client_confirmed_at, done: !!handover.client_confirmation },
    { label: 'Payment release eligible', time: timeFor('payment_released'), done: !!handover.completed_at },
    { label: 'Handover closed', time: timeFor('completed') || handover.completed_at, done: handover.status === 'completed' },
  ];
  return <section className="surface p-5"><p className="text-[11px] uppercase tracking-[.14em] font-semibold text-muted-foreground mb-4">Audit timeline</p><div>{rows.map((row, index) => <div key={row.label} className="flex gap-3"><div className="flex flex-col items-center"><div className={`grid w-7 h-7 place-items-center rounded-full text-[10px] font-bold shrink-0 ${row.done ? 'bg-primary text-primary-foreground' : 'border border-border bg-white text-muted-foreground'}`}>{row.done ? <Check className="w-3.5 h-3.5" /> : index + 1}</div>{index < rows.length - 1 && <div className={`w-px flex-1 min-h-[20px] ${row.done && rows[index + 1].done ? 'bg-primary/50' : 'bg-border'}`} />}</div><div className="pb-4"><p className={`text-sm ${row.done ? 'font-semibold' : 'text-muted-foreground'}`}>{row.label}</p>{row.time && <p className="text-[10px] text-muted-foreground">{new Date(row.time).toLocaleString('en-IN')}</p>}</div></div>)}</div></section>;
}

function InitiatePanel({ contest, handover, user, refresh }) {
  const { toast } = useToast();
  const [type, setType] = useState('both');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const toggle = (item) => setItems((prev) => prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]);
  const initiate = async () => {
    if (busy) return;
    if (!window.confirm('Start the managed handover now? This begins the transfer window for the winner.')) return;
    setBusy(true);
    try {
      const now = new Date();
      const payload = {
        contest_id: contest.id, contest_title: contest.title, client_id: contest.created_by_id, winner_id: contest.winner_user_id,
        handover_type: type, status: 'initiated', handover_items: JSON.stringify(items), started_at: now.toISOString(),
        deadline: new Date(now.getTime() + HANDOVER_DEADLINE_HOURS * 3600 * 1000).toISOString(),
        event_log: JSON.stringify([
          { actor: 'system', actor_id: '', action: 'winner_selected', detail: '', time: contest.winner_selected_at || now.toISOString() },
          { actor: 'client', actor_id: user.id, action: 'initiated', detail: '', time: now.toISOString() },
        ]),
      };
      if (handover) await base44.entities.Handover.update(handover.id, payload); else await base44.entities.Handover.create(payload);
      toast({ title: 'Handover initiated', description: `The winner now has ${HANDOVER_DEADLINE_HOURS} hours to complete the managed steps.` });
      refresh();
    } catch (e) {
      toast({ title: 'Could not initiate handover', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <WorkflowSteps steps={FLOW} current={1} />
    <section className="surface-2 p-5"><p className="text-[11px] uppercase tracking-[.14em] font-semibold text-primary">Step 1 · Define transfer</p><h1 className="mt-1 font-heading text-xl font-bold">Prepare the handover</h1><p className="mt-1 text-sm text-muted-foreground">Choose what is being transferred. Credentials should never be exchanged directly; use the managed workflow.</p><div className="mt-4 grid gap-2">{HANDOVER_TYPE_OPTIONS.map((o) => <button type="button" key={o.value} onClick={() => setType(o.value)} className={`text-left rounded-lg border p-3.5 ${type === o.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}><p className="text-sm font-semibold">{o.label}</p><p className="text-xs text-muted-foreground mt-0.5">{o.desc}</p></button>)}</div></section>
    <section className="surface p-5"><p className="text-[11px] uppercase tracking-[.14em] font-semibold text-muted-foreground mb-3">Assets / requirements</p><div className="flex flex-wrap gap-2">{HANDOVER_ITEM_OPTIONS.map((item) => <button type="button" key={item} onClick={() => toggle(item)} className={`text-xs px-3 py-1.5 rounded-lg border ${items.includes(item) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>{item}</button>)}</div></section>
    <Button onClick={initiate} disabled={busy} className="rz-primary-action w-full h-12 text-base font-semibold">{busy ? 'Starting handover…' : 'Start managed handover'}</Button>
  </div>;
}

function HintCard({ icon: Icon, title, text }) { return <section className="rz-empty"><div><Icon className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" /><p className="font-semibold text-sm">{title}</p><p className="text-xs text-muted-foreground mt-1 max-w-md">{text}</p></div></section>; }
