import { Repeat, Handshake, Flag, ShieldAlert } from 'lucide-react';

// Step 6 — "What happens after the winner is selected?" Stores post_winner_action + details.
const OPTIONS = [
  { key: 'ACCOUNT_HANDOVER', title: 'Account Handover', icon: Repeat, desc: 'The winning creator receives ownership or management access to an account, channel, page, or digital property.' },
  { key: 'CLIENT_COLLABORATION', title: 'Collaboration', icon: Handshake, desc: 'The winner continues working with the brand after the contest.' },
  { key: 'NONE', title: 'Contest Ends With Winner', icon: Flag, desc: 'The winner receives the prize and the contest ends — no handover or collaboration.' },
];
const HANDOVER_TYPES = ['Full ownership transfer', 'Admin access', 'Management access', 'Other'];
const PROPERTY_TYPES = ['Instagram', 'YouTube', 'TikTok', 'Facebook', 'Website', 'Other'];
const COLLAB_TYPES = ['Freelance project', 'Retainer', 'Content partnership', 'Brand collaboration', 'Ongoing creative work', 'Other'];
const COLLAB_DURATIONS = ['One-time', '1 month', '3 months', '6 months', 'Ongoing', 'Custom'];
const COMMS = ['Razekit chat', 'External communication', 'Both'];

const inputCls = 'w-full rounded-xl border border-border bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

function Field({ label, children }) {
  return <div><label className="text-sm font-medium">{label}</label><div className="mt-1">{children}</div></div>;
}

export default function WinnerOutcomeSection({ data, update }) {
  const sel = data.post_winner_action || '';
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-lg font-semibold">What happens after the winner is selected?</h3>
        <p className="text-sm text-muted-foreground">Tell creators what happens after the contest is completed.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {OPTIONS.map((o) => (
          <button key={o.key} type="button" onClick={() => update({ post_winner_action: o.key })}
            className={`text-left p-4 rounded-2xl border-2 transition-all ${sel === o.key ? 'border-primary bg-primary/5 shadow-primary-glow' : 'border-border bg-card hover:border-primary/40'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${sel === o.key ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}><o.icon className="w-5 h-5" /></div>
            <p className="font-heading font-semibold text-sm">{o.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{o.desc}</p>
          </button>
        ))}
      </div>

      {sel === 'ACCOUNT_HANDOVER' && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Handover type"><select className={inputCls} value={data.handover_type || ''} onChange={(e) => update({ handover_type: e.target.value })}><option value="">Select…</option>{HANDOVER_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Account / property type"><select className={inputCls} value={data.account_property_type || ''} onChange={(e) => update({ account_property_type: e.target.value })}><option value="">Select…</option>{PROPERTY_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          </div>
          <Field label="Handover instructions"><textarea rows={3} className={inputCls} value={data.handover_notes || ''} onChange={(e) => update({ handover_notes: e.target.value })} placeholder="What will be transferred and how." /></Field>
          <Field label="Handover deadline"><input type="datetime-local" className={inputCls} value={data.handover_deadline || ''} onChange={(e) => update({ handover_deadline: e.target.value })} /></Field>
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-500/10 rounded-xl p-3"><ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /><span>Never place passwords, OTPs or recovery codes in the contest. Access is granted through managed invites during the protected handover.</span></div>
        </div>
      )}

      {sel === 'CLIENT_COLLABORATION' && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Collaboration type"><select className={inputCls} value={data.collaboration_type || ''} onChange={(e) => update({ collaboration_type: e.target.value })}><option value="">Select…</option>{COLLAB_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Expected duration"><select className={inputCls} value={data.collaboration_duration || ''} onChange={(e) => update({ collaboration_duration: e.target.value })}><option value="">Select…</option>{COLLAB_DURATIONS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          </div>
          <Field label="Expected responsibilities"><textarea rows={2} className={inputCls} value={data.collaboration_responsibilities || ''} onChange={(e) => update({ collaboration_responsibilities: e.target.value })} /></Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Additional compensation (optional)"><input className={inputCls} value={data.additional_compensation || ''} onChange={(e) => update({ additional_compensation: e.target.value })} placeholder="e.g. ₹20,000 / month" /></Field>
            <Field label="Communication method"><select className={inputCls} value={data.collaboration_communication || ''} onChange={(e) => update({ collaboration_communication: e.target.value })}><option value="">Select…</option>{COMMS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          </div>
          <Field label="Collaboration notes"><textarea rows={2} className={inputCls} value={data.collaboration_notes || ''} onChange={(e) => update({ collaboration_notes: e.target.value })} /></Field>
        </div>
      )}

      {sel === 'NONE' && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">The winner receives the prize and the contest is marked completed after payout — no account handover or collaboration.</div>
      )}
    </div>
  );
}