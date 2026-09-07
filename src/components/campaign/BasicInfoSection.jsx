import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';
import { CATEGORIES, CONTEST_TYPES } from '@/lib/campaign-brief';

const inputCls = 'bg-background';

export default function BasicInfoSection({ data, update }) {
  const [uploading, setUploading] = useState(false);

  const handleCover = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      update({ cover_image_url: file_url });
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Contest Title *</Label>
          <Input className={inputCls} value={data.title || ''} onChange={(e) => update({ title: e.target.value })} placeholder="e.g. Summer Launch Reel — 30s Instagram Edit" />
        </div>
        <div className="space-y-1.5">
          <Label>Category *</Label>
          <select className={`${inputCls} h-10 w-full rounded-md border border-input px-3 text-sm bg-background`} value={data.category || ''} onChange={(e) => update({ category: e.target.value })}>
            <option value="">Select category…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Contest Type *</Label>
        <div className="flex flex-wrap gap-2">
          {CONTEST_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => update({ contest_type: t })}
              className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${data.contest_type === t ? 'bg-accent text-accent-foreground border-accent' : 'bg-background border-border text-muted-foreground hover:border-accent/50 hover:text-foreground'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Short Description *</Label>
        <Textarea className={inputCls} rows={3} value={data.short_description || ''} onChange={(e) => update({ short_description: e.target.value })} placeholder="One or two sentences creators see first — what is this campaign about?" />
      </div>

      <div className="space-y-1.5">
        <Label>Cover Image</Label>
        {data.cover_image_url ? (
          <div className="relative rounded-xl overflow-hidden border border-border group">
            <Image src={data.cover_image_url} alt="Contest cover" className="w-full h-40" fittingType="fill" />
            <div className="absolute top-2 right-2 flex gap-2">
              <label className="px-3 py-1.5 rounded-lg bg-background/90 border border-border text-xs font-medium cursor-pointer hover:bg-background flex items-center gap-1">
                Change
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && handleCover(e.target.files[0])} />
              </label>
              <button type="button" onClick={() => update({ cover_image_url: '' })} className="px-3 py-1.5 rounded-lg bg-background/90 border border-border text-xs font-medium hover:bg-destructive hover:text-destructive-foreground hover:border-destructive flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-xl h-40 cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors">
            {uploading ? <Loader2 className="w-6 h-6 animate-spin text-accent" /> : <ImagePlus className="w-6 h-6 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">{uploading ? 'Uploading…' : 'Upload a cover image'}</span>
            <span className="text-[11px] text-muted-foreground/70">JPG or PNG, recommended 1600×900</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && handleCover(e.target.files[0])} />
          </label>
        )}
      </div>
    </div>
  );
}