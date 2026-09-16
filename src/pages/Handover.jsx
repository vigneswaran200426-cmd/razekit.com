import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, Send, ShieldCheck, Clock, MessagesSquare } from 'lucide-react';
import { entities, fn } from '@/lib/api';
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
  // A failed contest load used to leave this page shimmering forever: the load
  // swallowed the error to null and the render gate treated null as "still
  // loading". A failure now has somewhere to go.
  const [loadErr, setLoadErr] = useState('');
  const [actionErr, setActionErr] = useState('');
  const endRef = useRef(null);

  const loadMsgs = async (hid) => { const m = await entities.HandoverMessage.filter({ handover_id: hid }, 'created_date', 200).catch(() => []); setMsgs(m || []); };

  const load = useCallback(async () => {
    setLoadErr('');
    try {
      const c = await entities.Contest.get(id);
      setContest(c);
      const list = await entities.Handover.filter({ contest_id: id }, '-created_date', 1).catch(() => []);
      const h = (list || [])[0] || null;
      setHo(h);
      if (h) loadMsgs(h.id);
    } catch (e) {
      setLoadErr(e?.data?.error?.message || e?.message || 'We could not load this handover.');
      setHo(null);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  const isClient = contest && user?.id === contest.created_by_id;
  const isWinner = contest && user?.id === contest.winner_user_id;

  // Every mutation below goes through a server function. The browser used to
  // write status, client_id, winner_id and completed_at directly; all four are
  // server-only, so each of these actions was a silent 403 that changed nothing
  // and said nothing. The client now states an intent and the server decides.
  const start = async () => {
    setBusy(true); setActionErr('');
    try {
      const r = await fn('handoverStart', { contest_id: id });
      setHo(r.handover);
      if (r.handover) loadMsgs(r.handover.id);
    } catch (e) {
      setActionErr(e?.data?.error?.message || e?.message || 'The handover could not be started.');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!ho) return;
    setBusy(true); setActionErr('');
    try {
      // Which side the caller is on, whether both have now confirmed, and the
      // resulting status are all decided server-side. Completion gates payout,
      // so it is not a conclusion a browser gets to reach.
      const r = await fn('handoverConfirm', { handover_id: ho.id });
      setHo(r.handover);
      if (r.completed) await load();
    } catch (e) {
      setActionErr(e?.data?.error?.message || e?.message || 'Your confirmation could not be recorded.');
    } finally { setBusy(false); }
  };

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !ho) return;
    setActionErr('');
    try {
      const r = await fn('handoverSend', { handover_id: ho.id, body });
      // The composer is cleared only once the message exists. It used to be
      // cleared first, so a rejected send destroyed what the user had typed in
      // a room they were told was how the two parties coordinate.
      setText('');
      if (r.message) setMsgs((p) => [...p, r.message]);
    } catch (err) {
      setActionErr(err?.data?.error?.message || err?.message || 'That message could not be sent. Your text is still here.');
    }
  };

  // A real failure gets a real surface. `!contest` alone used to mean "keep
  // shimmering", which turned every 404, 403 and dropped connection into a page
  // that never resolved and offered no way out but the back button.
  if (loadErr) {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Contest
        </Link>
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <h1 className="font-display text-lg font-bold text-ink">This handover could not be loaded</h1>
              <p className="mt-1 text-sm text-muted">{loadErr}</p>
              <p className="mt-1 text-[13px] text-muted">Nothing has been changed. It is safe to try again.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={load}>Try again</Button>
                <Button variant="secondary" to={`/contest/${id}`}>Back to contest</Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

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
                  <span className={cn('grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold shrink-0 z-10', done ? 'bg-primary-hover text-white' : current ? 'bg-primary/15 text-primary ring-2 ring-primary' : 'bg-surface-2 text-muted')}>
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
            {actionErr && (
              <div role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-danger/25 bg-danger-wash px-3 py-2 text-[13px] text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{actionErr}</span>
              </div>
            )}
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
                  <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm', mine ? 'bg-primary-hover text-white' : 'bg-surface-2 text-ink')}>{m.body}</div>
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
