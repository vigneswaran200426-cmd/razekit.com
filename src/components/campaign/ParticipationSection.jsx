import { Globe, ShieldCheck, KeyRound } from 'lucide-react';

const OPTIONS = [
  { id: 'open', label: 'Open to all', desc: 'Any creator can join and submit.', icon: Globe, active: (d) => !d.verified_creators_only && !d.private_contest, apply: () => ({ verified_creators_only: false, private_contest: false }) },
  { id: 'verified', label: 'Verified creators only', desc: 'Only verified creators can participate.', icon: ShieldCheck, active: (d) => d.verified_creators_only && !d.private_contest, apply: () => ({ verified_creators_only: true, private_contest: false }) },
  { id: 'invite', label: 'Invite-only', desc: 'Only creators you invite can participate.', icon: KeyRound, active: (d) => d.private_contest, apply: () => ({ verified_creators_only: false, private_contest: true }) },
];

export default function ParticipationSection({ data, update }) {
  const unlimited = !data.submission_limit || data.submission_limit <= 0;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Who can participate</p>
        <div className="grid sm:grid-cols-3 gap-2">
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = o.active(data);
            return (
              <button key={o.id} type="button" onClick={() => update(o.apply())}
                className={`text-left border rounded-xl p-3 transition-colors ${active ? 'border-accent bg-accent/5' : 'border-border bg-background hover:border-accent/40'}`}>
                <Icon className={`w-4 h-4 mb-1.5 ${active ? 'text-accent' : 'text-muted-foreground'}`} />
                <p className="text-sm font-medium">{o.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{o.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Submission limit per creator</p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="sublimit" checked={unlimited} onChange={() => update({ submission_limit: 0 })} className="accent-[hsl(var(--accent))]" />
            Unlimited
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="sublimit" checked={!unlimited} onChange={() => update({ submission_limit: 1 })} className="accent-[hsl(var(--accent))]" />
            Limit to
            <input type="number" min="1" max="10" disabled={unlimited} value={data.submission_limit || ''} onChange={(e) => update({ submission_limit: Math.max(1, parseInt(e.target.value) || 1) })}
              className="h-9 w-20 rounded-md border border-input px-2 text-sm bg-background disabled:opacity-40" />
            per creator
          </label>
        </div>
      </div>
    </div>
  );
}