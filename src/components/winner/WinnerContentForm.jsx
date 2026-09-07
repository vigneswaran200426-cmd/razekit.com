import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UploadCloud, Image as ImageIcon, FileVideo, X, Loader2 } from 'lucide-react';
import { validateVideoFile } from '@/lib/submission-utils';

const VIDEO_HINT = 'MP4, MOV, WebM · up to 500 MB · 1080p+ recommended';
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

// Creator winner-content form — prefilled from the contest, minimal friction.
export default function WinnerContentForm({ contest, publish, submitting, onSubmit, onDraft }) {
  const mediaInput = useRef(null);
  const thumbInput = useRef(null);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaError, setMediaError] = useState('');
  const [thumbFile, setThumbFile] = useState(null);
  const [thumbPreview, setThumbPreview] = useState('');
  const [fields, setFields] = useState({
    title: publish?.title || contest.title || '',
    description: publish?.description || '',
    caption: publish?.caption || '',
    category: publish?.category || contest.category || '',
    tools_used: publish?.tools_used || '',
    creator_note: publish?.creator_note || '',
    social_links: publish?.social_links || '',
  });

  const set = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const pickMedia = (f) => {
    setMediaError('');
    if (!f) return;
    if (f.type.startsWith('video/')) {
      const v = validateVideoFile(f);
      if (!v.ok) { setMediaError(v.error); return; }
    } else if (IMAGE_TYPES.includes(f.type)) {
      if (f.size > 10 * 1024 * 1024) { setMediaError('Image is too large. Maximum is 10 MB.'); return; }
    } else {
      setMediaError('Unsupported format. Use a video (MP4, MOV, WebM) or an image (PNG, JPG, WebP).');
      return;
    }
    setMediaFile(f);
  };

  const pickThumb = (f) => {
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) { setMediaError('Thumbnail must be PNG, JPG or WebP.'); return; }
    if (f.size > 10 * 1024 * 1024) { setMediaError('Thumbnail is too large. Maximum is 10 MB.'); return; }
    setThumbFile(f);
    setThumbPreview(URL.createObjectURL(f));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!mediaFile) { setMediaError('Please upload your winning video or image.'); return; }
    if (!fields.title.trim()) { setMediaError('Please add a title for your winning work.'); return; }
    onSubmit({ fields: { ...fields, title: fields.title.trim() }, mediaFile, thumbFile });
  };

  return (
    <form onSubmit={submit} className="glass-card rounded-2xl p-5 md:p-6 space-y-5 animate-fade-in">
      {/* Media upload */}
      <div>
        <Label className="text-sm font-semibold">Winning media <span className="text-destructive">*</span></Label>
        <p className="text-xs text-muted-foreground mb-2">Video or image · {VIDEO_HINT}</p>
        <button
          type="button"
          onClick={() => mediaInput.current?.click()}
          className="w-full rounded-2xl border-2 border-dashed border-primary/30 bg-secondary/40 hover:bg-secondary/70 transition-colors p-6 flex flex-col items-center text-center"
        >
          {mediaFile ? (
            <>
              <FileVideo className="w-8 h-8 text-primary mb-2" />
              <p className="text-sm font-medium truncate max-w-[240px]">{mediaFile.name}</p>
              <span className="text-xs text-muted-foreground mt-0.5">{mediaFile.type.startsWith('video/') ? 'Video ready' : 'Image ready'} · tap to replace</span>
            </>
          ) : (
            <>
              <UploadCloud className="w-8 h-8 text-primary mb-2" />
              <p className="text-sm font-medium">Upload your winning work</p>
              <span className="text-xs text-muted-foreground mt-0.5">Drag & drop or tap to browse</span>
            </>
          )}
        </button>
        <input ref={mediaInput} type="file" accept="video/*,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickMedia(e.target.files?.[0])} />
        {mediaFile && (
          <button type="button" onClick={() => { setMediaFile(null); if (mediaInput.current) mediaInput.current.value = ''; }}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
            <X className="w-3.5 h-3.5" /> Remove media
          </button>
        )}
      </div>

      {/* Optional cover */}
      <div>
        <Label className="text-sm font-semibold">Cover image <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <p className="text-xs text-muted-foreground mb-2">Shown on Winners Hub cards. We can also pick a frame automatically.</p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => thumbInput.current?.click()}
            className="w-20 h-14 rounded-xl border-2 border-dashed border-primary/30 bg-secondary/40 hover:bg-secondary/70 transition-colors overflow-hidden shrink-0 flex items-center justify-center">
            {thumbPreview ? <img src={thumbPreview} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-primary" />}
          </button>
          <span className="text-xs text-muted-foreground">PNG, JPG or WebP · up to 10 MB</span>
        </div>
        <input ref={thumbInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickThumb(e.target.files?.[0])} />
      </div>

      {/* Details */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wc-title" className="text-sm font-semibold">Winning title <span className="text-destructive">*</span></Label>
          <Input id="wc-title" value={fields.title} onChange={set('title')} className="mt-1.5" placeholder="Launch Film" />
        </div>
        <div>
          <Label htmlFor="wc-cat" className="text-sm font-semibold">Creative category</Label>
          <Input id="wc-cat" value={fields.category} onChange={set('category')} className="mt-1.5" placeholder="Advertisement" />
        </div>
      </div>
      <div>
        <Label htmlFor="wc-desc" className="text-sm font-semibold">Short description</Label>
        <textarea id="wc-desc" value={fields.description} onChange={set('description')} rows={2}
          className="mt-1.5 w-full rounded-xl border border-input bg-white/60 backdrop-blur-sm px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          placeholder="What the work is, in one or two lines" />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wc-tools" className="text-sm font-semibold">Tools used</Label>
          <Input id="wc-tools" value={fields.tools_used} onChange={set('tools_used')} className="mt-1.5" placeholder="Premiere Pro, After Effects" />
        </div>
        <div>
          <Label htmlFor="wc-links" className="text-sm font-semibold">Social links <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="wc-links" value={fields.social_links} onChange={set('social_links')} className="mt-1.5" placeholder="instagram.com/you" />
        </div>
      </div>
      <div>
        <Label htmlFor="wc-note" className="text-sm font-semibold">Creator note / winning story <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <textarea id="wc-note" value={fields.creator_note} onChange={set('creator_note')} rows={3}
          className="mt-1.5 w-full rounded-xl border border-input bg-white/60 backdrop-blur-sm px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          placeholder="How you approached the brief — future brands love reading this" />
      </div>

      {mediaError && <p className="text-sm text-destructive">{mediaError}</p>}

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={() => onDraft(fields)} disabled={submitting}>Save Draft</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Submit for Brand Approval
        </Button>
      </div>
    </form>
  );
}