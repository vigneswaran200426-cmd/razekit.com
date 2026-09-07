import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, X, Pencil, Trash2, ExternalLink, Paperclip, Loader2, Link2, Film, FolderOpen, Image as ImageIcon, BookOpen, Lightbulb, Package, Music, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { RESOURCE_TYPES, RESOURCE_PERMISSIONS, RESOURCE_FILTERS, RESOURCE_TYPE_GROUPS, parseJSON, emptyResource } from '@/lib/campaign-brief';

const TYPE_ICONS = { Reference: Link2, Footage: Film, 'Source Material': FolderOpen, 'Brand Asset': ImageIcon, 'Brand Guidelines': BookOpen, Inspiration: Lightbulb, 'Product Information': Package, 'Music/Audio': Music, Document: FileText, Other: Paperclip };

const selectCls = 'h-10 w-full rounded-md border border-input px-3 text-sm bg-background';

export default function ResourcesSection({ data, update }) {
  const [filter, setFilter] = useState('All');
  const [draft, setDraft] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  const resources = parseJSON(data.resources);

  const saveResource = () => {
    if (!draft || !draft.type || !draft.title.trim() || !(draft.kind === 'link' ? draft.url.trim() : draft.file_url)) return;
    const next = draft.id && resources.some((r) => r.id === draft.id)
      ? resources.map((r) => (r.id === draft.id ? draft : r))
      : [...resources, draft];
    update({ resources: JSON.stringify(next) });
    setDraft(null);
  };

  const uploadFile = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setDraft((d) => ({ ...d, kind: 'file', file_url, file_name: file.name, url: '' }));
    } finally { setUploading(false); }
  };

  const filtered = filter === 'All' ? resources : resources.filter((r) => RESOURCE_TYPE_GROUPS[filter]?.includes(r.type));
  const canSave = draft && draft.type && draft.title.trim() && (draft.kind === 'link' ? draft.url.trim() : draft.file_url);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {RESOURCE_FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filter === f ? 'bg-accent text-accent-foreground border-accent' : 'bg-background border-border text-muted-foreground hover:text-foreground'}`}>
            {f}
          </button>
        ))}
        <Button size="sm" variant="outline" className="ml-auto border-accent/40 text-accent hover:bg-accent/10 hover:text-accent" onClick={() => setDraft(emptyResource())}>
          <Plus className="w-4 h-4" /> Add Resource
        </Button>
      </div>

      {draft && (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Resource Type *</Label>
              <select className={selectCls} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input className="bg-background" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Product demo footage" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Link or File *</Label>
            {draft.kind === 'link' ? (
              <>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="bg-background pl-10" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://drive.google.com/… (Drive, Dropbox, YouTube, Vimeo — links open directly, never downloaded)" />
                </div>
                <button type="button" className="text-xs text-accent hover:underline" onClick={() => setDraft({ ...draft, kind: 'file' })}>Or upload a file instead</button>
              </>
            ) : (
              <>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}
                  onClick={() => fileInput.current?.click()}
                  className="flex flex-col items-center justify-center gap-1.5 border border-dashed border-border rounded-xl h-24 cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors bg-background"
                >
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin text-accent" /> : <Paperclip className="w-5 h-5 text-muted-foreground" />}
                  <span className="text-xs text-muted-foreground">{uploading ? 'Uploading…' : draft.file_url ? draft.file_name : 'Drop a file here or click to browse'}</span>
                </div>
                <input ref={fileInput} type="file" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) uploadFile(f); }} />
                <button type="button" className="text-xs text-accent hover:underline" onClick={() => setDraft({ ...draft, kind: 'link' })}>Or paste an external link instead</button>
              </>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea className="bg-background" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What is this resource?" />
            </div>
            <div className="space-y-1.5">
              <Label>Usage Instructions</Label>
              <Textarea className="bg-background" rows={2} value={draft.usage_instructions} onChange={(e) => setDraft({ ...draft, usage_instructions: e.target.value })} placeholder="How should creators use it?" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Usage Permission</Label>
            <select className={selectCls} value={draft.permission} onChange={(e) => setDraft({ ...draft, permission: e.target.value })}>
              {RESOURCE_PERMISSIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="sm" className="bg-accent hover:bg-accent/90" disabled={!canSave} onClick={saveResource}>{draft.id && resources.some((r) => r.id === draft.id) ? 'Save Changes' : 'Add Resource'}</Button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !draft && (
        <p className="text-sm text-muted-foreground text-center py-6">No resources yet — add references, footage, brand assets or inspiration for creators.</p>
      )}

      <div className="space-y-2">
        {filtered.map((r) => {
          const Icon = TYPE_ICONS[r.type] || Paperclip;
          return (
            <div key={r.id} className="flex items-start gap-3 border border-border rounded-xl p-3 bg-background hover:border-accent/40 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-accent" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">{r.type}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">{r.permission}</span>
                </div>
                {r.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.description}</p>}
                <div className="flex items-center gap-3 mt-1">
                  {r.kind === 'link' && r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> {r.url.replace(/^https?:\/\//, '').slice(0, 40)}</a>
                  ) : (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Paperclip className="w-3 h-3" /> {r.file_name}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => setDraft(r)} className="w-7 h-7 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => update({ resources: JSON.stringify(resources.filter((x) => x.id !== r.id)) })} className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}