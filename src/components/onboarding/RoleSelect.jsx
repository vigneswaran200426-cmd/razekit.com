import { Briefcase, Video, ArrowRight } from 'lucide-react';

const OPTIONS = [
  { key: 'creator', icon: Video, title: 'Join as Creator', desc: 'Enter contests, submit edits and earn prizes.' },
  { key: 'client', icon: Briefcase, title: 'Join as Brand', desc: 'Launch contests and discover creative talent.' },
];

export default function RoleSelect({ onSelect }) {
  return (
    <div className="max-w-md w-full text-center">
      <h1 className="font-heading text-2xl font-bold mb-2">What are you here to do?</h1>
      <p className="text-sm text-muted-foreground mb-8">Choose your account type — this can't be changed later.</p>
      <div className="space-y-3 text-left">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.key}
              onClick={() => onSelect(o.key)}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-heading font-semibold">{o.title}</p>
                <p className="text-xs text-muted-foreground">{o.desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}