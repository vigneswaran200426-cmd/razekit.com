import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, Send, ShieldCheck, Clock, MessagesSquare } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateShort } from '@/lib/format';
import { Card, Button, Badge, Input, PageHeader, Skeleton, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

const STEPS = ['Winner selected', 'Handover started', 'Winner confirms', 'Client confirms', 'Completed'];

export default function Handover() {
  const { id } = useParams();
  const { user } = useAuth();
  const [contest, setContest] = useState(null);
  const [ho, setHo] = useState(undefined); // undefined=loading, null=none
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const loadMsgs = async (hid) => { const m = await entities.HandoverMessage.filter({ handover_id: hid }, 'created_date', 200).catch(() => []); setMsgs(m || []); };

  useEffect(() => {
    (async () => {
      const c = await entities.Contest.get(id).catch(() => null);
      setContest(c);
      const list = await entities.Handover.filter({ contest_id: id }, '-created_date', 1).catch(() => []);
      const h = (list || [])[0] || null;
      setHo(h);
      if (h) loadMsgs(h.id);
    })();
  }, [id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  const isClient = contest && user?.id === contest.created_by_id;
  const isWinner = contest && user?.id === contest.winner_user_id;

  const start = async () => {
    setBusy(true);
    try {
      const h = await entities.Handover.create({ contest_id: id, contest_title: contest.title, client_id: contest.created_by_id, winner_id: contest.winner_user_id, status: 'initiated', started_at: new Date().toISOString() });
      setHo(h);
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!ho) return;
    setBusy(true);
    try {
      const patch = {};
      if (isWinner) { patch.creator_confirmation = true; patch.creator_confirmed_at = new Date().toISOString(); }
      if (isClient) { patch.client_confirmation = true; patch.client_confirmed_at = new Date().toISOString(); }
      const bothAfter = (ho.creator_confirmation || isWinner) && (ho.client_confirmation || isClient);
      patch.status = bothAfter ? 'completed' : (isWinner ? 'winner_confirmed' : 'in_progress');
      if (bothAfter) patch.completed_at = new Date().toISOString();
      const updated = await entities.Handover.update(ho.id, patch);
      setHo(updated);
      if (bothAfter) await entities.Contest.update(id, { status: 'completed', completed_at: new Date().toISOString() }).catch(() => {});
    } finally { setBusy(false); }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !ho) return;
    const body = text.trim(); setText('');
    const m = await entities.HandoverMessage.create({ handover_id: ho.id, contest_id: id, client_id: ho.client_id, winner_id: ho.winner_id, sender_id: user.id, sender_role: isClient ? 'client' : 'creator', body }).catch(() => null);
    if (m) setMsgs((p) => [...p, m]);
  };

  if (ho === undefined || !contest) {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-72" />
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
          <Skeleton className="h-[420px] rounded-lg" />
          <Skeleton className="h-[420px] rounded-lg" />
        </div>
      </div>
    );
  }

  // Step index
  let step = 1; // winner selected
  if (ho) { step = 2; if (ho.creator_confirmation) step = 3; if (ho.client_confirmation) step = Math.max(step, 4); if (ho.status === 'completed') step = 5; }
  const canConfirm = ho && (isWinner ? !ho.creator_confirmation : isClient ? !ho.client_confirmation : false) && ho.status !== 'completed';

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Contest</Link>
      <PageHeader
        eyebrow="Account handover"
        title={contest.title}
        description="Both parties confirm the transfer before the contest completes."
        actions={<Badge tone={ho?.status === 'completed' ? 'success' : 'primary'} className="capitalize">{ho ? ho.status.replace('_', ' ') : 'Not started'}</Badge>}
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        {/* Timeline */}
        <Card className="p-6">
          <ol className="space-y-0">
            {STEPS.map((label, i) => {
              const n = i + 1; const done = n < step; const current = n === step;
              return (
                <li key={label} className="flex gap-3 pb-6 last:pb-0 relative">
                  {i < STEPS.length - 1 && <span className={cn('absolute left-[15px] top-8 bottom-0 w-0.5', done ? 'bg-primary' : 'bg-line')} />}
                  <span className={cn('grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold shrink-0 z-10', done ? 'bg-primary text-white' : current ? 'bg-primary/15 text-primary ring-2 ring-primary' : 'bg-surface-2 text-muted')}>
                    {done ? <Check className="w-4 h-4" aria-hidden="true" /> : n}
                  </span>
                  <div className="pt-1"><p className={cn('font-semibold text-sm', done || current ? 'text-ink' : 'text-muted')}>{label}</p>
                    {n === 3 && ho?.creator_confirmed_at && <p className="text-xs text-muted mt-0.5">Confirmed {dateShort(ho.creator_confirmed_at)}</p>}
                    {n === 4 && ho?.client_confirmed_at && <p className="text-xs text-muted mt-0.5">Confirmed {dateShort(ho.client_confirmed_at)}</p>}</div>
                </li>
              );
            })}
          </ol>

          <div className="mt-2 pt-5 border-t border-line">
            {!ho ? (
              (isClient || isWinner) ? <Button loading={busy} onClick={start}>Start handover</Button> : <p className="text-sm text-muted">Waiting for the handover to begin.</p>
            ) : ho.status === 'completed' ? (
              <p className="flex items-center gap-2 text-sm text-success font-medium"><ShieldCheck className="w-4 h-4" aria-hidden="true" /> Handover complete — payout is now eligible.</p>
            ) : canConfirm ? (
              <Button loading={busy} onClick={confirm}><Check className="w-4 h-4" aria-hidden="true" /> Confirm {isWinner ? 'transfer complete' : 'receipt & ownership'}</Button>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted"><Clock className="w-4 h-4" aria-hidden="true" /> Waiting on the other party to confirm.</p>
            )}
          </div>
        </Card>

        {/* Messages */}
        <Card className="flex flex-col h-[70vh]">
          <div className="px-4 py-3 border-b border-line"><p className="font-semibold text-sm text-ink">Private room</p><p className="text-xs text-muted">Only you and the other party can see this.</p></div>
          <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
            {msgs.length === 0 && (
              <EmptyState
                icon={MessagesSquare}
                title="No messages yet"
                description="Use this private room to coordinate the transfer with the other party."
                className="border-0 bg-transparent py-8"
              />
            )}
            {msgs.map((m) => {
              const mine = m.sender_id === user.id;
              return (
                <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm', mine ? 'bg-primary text-white' : 'bg-surface-2 text-ink')}>{m.body}</div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          {ho && (
            <form onSubmit={send} className="p-3 border-t border-line flex gap-2">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" aria-label="Message the other party" className="flex-1" />
              <Button type="submit" size="md" disabled={!text.trim()} aria-label="Send message"><Send className="w-4 h-4" aria-hidden="true" /></Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
