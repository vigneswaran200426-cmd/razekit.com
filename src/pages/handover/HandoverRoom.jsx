import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import HandoverShell from '@/components/handover/HandoverShell';
import SecurityBanner from '@/components/handover/SecurityBanner';
import { parseEventLog, EVENT_LABELS } from '@/lib/handover-utils';

// Protected two-party room: client ↔ winner messages, with the handover's
// system-recorded events shown inline as a timeline. No credential-sharing controls.
export default function HandoverRoom() {
  const { id } = useParams();
  return (
    <HandoverShell contestId={id} active="room">
      {(ctx) => <RoomPanel {...ctx} />}
    </HandoverShell>
  );
}

function RoomPanel({ handover, user, isClient, refresh }) {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!handover?.id) return;
    const list = await base44.entities.HandoverMessage.filter({ handover_id: handover.id }, 'created_date', 100).catch(() => []);
    setMessages(list);
  }, [handover?.id]);
  useEffect(() => { load(); }, [load]);

  if (!handover?.started_at) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center card-shadow">
        <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm font-medium mb-1">The handover hasn't been initiated yet</p>
        <p className="text-xs text-muted-foreground">Messages open once the brand initiates the handover.</p>
      </div>
    );
  }

  const events = parseEventLog(handover).filter((e) => e.action !== 'winner_selected');
  const items = [
    ...events.map((e) => ({ kind: 'event', time: e.time, ...e })),
    ...(messages || []).map((m) => ({ kind: 'msg', time: m.created_date, ...m })),
  ].sort((a, b) => new Date(a.time) - new Date(b.time));

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await base44.entities.HandoverMessage.create({
        handover_id: handover.id, contest_id: handover.contest_id,
        client_id: handover.client_id, winner_id: handover.winner_id,
        sender_id: user.id, sender_role: isClient ? 'client' : 'creator', body,
      });
      if (handover.status === 'initiated') {
        await base44.entities.Handover.update(handover.id, { status: 'in_progress' }).catch(() => {});
        refresh();
      }
      setText('');
      load();
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <SecurityBanner />
      <div className="bg-card border border-border rounded-2xl p-4 card-shadow space-y-3 min-h-[300px]">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-10">
            No messages yet — coordinate the handover here. Never share credentials.
          </p>
        )}
        {items.map((it, i) =>
          it.kind === 'event' ? (
            <div key={`e${i}`} className="flex justify-center">
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
                {EVENT_LABELS[it.action] || it.action} · {new Date(it.time).toLocaleString('en-IN')}
              </span>
            </div>
          ) : (
            <div key={`m${i}`} className={`flex ${it.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${it.sender_id === user.id ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                <p className="text-sm whitespace-pre-wrap break-words">{it.body}</p>
                <p className={`text-[9px] mt-1 ${it.sender_id === user.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {it.sender_role === 'client' ? 'Brand' : 'Creator'} · {new Date(it.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Write a message…"
        />
        <Button onClick={send} disabled={sending || !text.trim()}><Send className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}