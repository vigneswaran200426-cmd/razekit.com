import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, FileVideo } from 'lucide-react';
import { CONTENT_TYPES, PLATFORMS, ASPECT_RATIOS, RESOLUTIONS, parseJSON, emptyDeliverable } from '@/lib/campaign-brief';

const selectCls = 'h-10 w-full rounded-md border border-input px-3 text-sm bg-background';

export default function DeliverablesSection({ data, update }) {
  const [draft, setDraft] = useState(null);
  const deliverables = parseJSON(data.deliverables);

  const save = () => {
    if (!draft || !draft.name.trim()) return;
    const next = draft.id && deliverables.some((d) => d.id === draft.id)
      ? deliverables.map((d) => (d.id === draft.id ? draft : d))
      : [...deliverables, draft];
    update({ deliverables: JSON.stringify(next) });
    setDraft(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Specify exactly what creators must submit. Multiple deliverables allowed.</p>
        <Button size="sm" variant="outline" className="border-accent/40 text-accent hover:bg-accent/10 hover:text-accent" onClick={() => setDraft(emptyDeliverable())}>
          <Plus className="w-4 h-4" /> Add Deliverable
        </Button>
      </div>

      {draft && (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input className="bg-background" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Primary 30s edit" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Content Type</Label>
              <select className={selectCls} value={draft.content_type} onChange={(e) => setDraft({ ...draft, content_type: e.target.value })}>
                {CONTENT_TYPES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Platform</Label>
              <select className={selectCls} value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })}>
                {PLATFORMS.map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duration</Label>
              <Input className="bg-background" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} placeholder="e.g. 30s" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Aspect Ratio</Label>
              <select className={selectCls} value={draft.aspect_ratio} onChange={(e) => setDraft({ ...draft, aspect_ratio: e.target.value })}>
                {ASPECT_RATIOS.map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Resolution</Label>
              <select className={selectCls} value={draft.resolution} onChange={(e) => setDraft({ ...draft, resolution: e.target.value })}>
                {RESOLUTIONS.map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">File Format</Label>
              <Input className="bg-background" value={draft.file_format} onChange={(e) => setDraft({ ...draft, file_format: e.target.value })} placeholder="e.g. MP4, MOV" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quantity</Label>
              <Input className="bg-background" type="number" min="1" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: parseInt(e.target.value) || 1 })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Instructions</Label>
            <Textarea className="bg-background" rows={2} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} placeholder="Anything creators must know about this deliverable…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="sm" className="bg-accent hover:bg-accent/90" disabled={!draft.name.trim()} onClick={save}>Save Deliverable</Button>
          </div>
        </div>
      )}

      {deliverables.length === 0 && !draft && (
        <p className="text-sm text-muted-foreground text-center py-6">No deliverables yet — tell creators what to submit and how.</p>
      )}

      <div className="space-y-2">
        {deliverables.map((d) => (
          <div key={d.id} className="border border-border rounded-xl p-3 bg-background hover:border-accent/40 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><FileVideo className="w-5 h-5 text-accent" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{d.name}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {[d.content_type, d.platform, d.duration, d.aspect_ratio, d.resolution, d.file_format, `${d.quantity}×`].filter(Boolean).map((v, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">{v}</span>
                  ))}
                </div>
                {d.instructions && <p className="text-xs text-muted-foreground mt-1.5">{d.instructions}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => setDraft(d)} className="w-7 h-7 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => update({ deliverables: JSON.stringify(deliverables.filter((x) => x.id !== d.id)) })} className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}