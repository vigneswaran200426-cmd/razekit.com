import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { parseJSON } from '@/lib/campaign-brief';

export default function RequirementsSection({ data, update }) {
  const [text, setText] = useState('');
  const custom = parseJSON(data.custom_requirements);

  const add = () => {
    if (!text.trim()) return;
    update({ custom_requirements: JSON.stringify([...custom, { id: crypto.randomUUID(), text: text.trim() }]) });
    setText('');
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Platform Requirements — always enforced</p>
        <div className="space-y-1.5">
          {[
            'Submit only original work created for this contest',
            'Submit before the deadline — late entries are not accepted',
            'Follow the required file format and specifications',
            'Respect platform content policies',
            'No copyright-infringing material',
            'Include all required files in your submission',
            'Follow the campaign brief and deliverable instructions',
          ].map((r) => (
            <div key={r} className="flex items-center gap-2.5 text-sm text-muted-foreground bg-secondary/40 border border-border/60 rounded-lg px-3 py-2">
              <Lock className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
              {r}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Your Additional Requirements</p>
        <div className="flex gap-2">
          <Input className="bg-background" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="e.g. Include the brand logo in the first 3 seconds" />
          <button type="button" onClick={add} disabled={!text.trim()} className="h-10 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5 shrink-0">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {custom.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {custom.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm bg-accent/5 border border-accent/20 rounded-lg px-3 py-2">
                <span>{r.text}</span>
                <button type="button" onClick={() => update({ custom_requirements: JSON.stringify(custom.filter((x) => x.id !== r.id)) })} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}