import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Film, Image as ImageIcon, Loader2, RotateCcw, Trash2, UploadCloud } from 'lucide-react';
import {
  validateVideoFile, extractVideoMetadata, generateThumbnailBlob,
  formatBytes, formatDuration, resolutionLabel,
} from '@/lib/submission-utils';
import MediaUploader from './MediaUploader';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const VIDEO_EXT = ['mp4', 'mov', 'webm', 'mkv'];

export function mediaValidationErrors(value, reqs) {
  const { kind, meta } = value || {};
  const errors = [];
  if (kind === 'video' && reqs?.maxDurationSec && meta?.duration && meta.duration > reqs.maxDurationSec + 1) {
    errors.push(`This video is ${Math.round(meta.duration)} seconds. This contest allows a maximum of ${reqs.maxDurationSec} seconds.`);
  }
  if (kind === 'video' && reqs?.aspectRatios?.length && meta?.width && meta?.height) {
    const r = meta.width / meta.height;
    const ok = reqs.aspectRatios.some((spec) => {
      const parts = String(spec).split(/[:x×]/).map(Number);
      if (!parts[0] || !parts[1]) return true; // unparsable spec — don't block
      return Math.abs(r - parts[0] / parts[1]) / (parts[0] / parts[1]) <= 0.02;
    });
    if (!ok) {
      errors.push(`This video is ${(r).toFixed(2)} aspect ratio. This contest requires ${reqs.aspectRatios.join(' or ')}.`);
    }
  }
  return errors;
}

// FINAL SUBMISSION upload + preview + requirement validation.
// The final asset uploads to private storage immediately (so a draft restore
// keeps it); validation errors are advisory + gate the final checklist.
export default function FinalCreativeSection({ reqs, value, onChange }) {
  const [phase, setPhase] = useState('idle'); // idle | uploading | processing | error
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [posterUrl, setPosterUrl] = useState('');

  // Restore preview for a draft-restored asset.
  useEffect(() => {
    if (!value?.file_uri) return;
    if (!previewUrl) {
      base44.integrations.Core.CreateFileSignedUrl({ file_uri: value.file_uri, expires_in: 3600 })
        .then(({ signed_url }) => setPreviewUrl(signed_url)).catch(() => {});
    }
    if (value.thumbnail_uri && !posterUrl) {
      base44.integrations.Core.CreateFileSignedUrl({ file_uri: value.thumbnail_uri, expires_in: 3600 })
        .then(({ signed_url }) => setPosterUrl(signed_url)).catch(() => {});
    }
  }, [value?.file_uri]);

  const handleFile = async (f) => {
    if (!f || phase === 'uploading' || phase === 'processing') return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const isImage = IMAGE_EXT.includes(ext);
    const isVideo = VIDEO_EXT.includes(ext);
    if (!isVideo && !isImage) {
      setError('Unsupported format. Please upload MP4, MOV, WebM, JPG, PNG or WebP.');
      setPhase('error');
      return;
    }
    if (isVideo) {
      const v = validateVideoFile(f);
      if (!v.ok) { setError(v.error); setPhase('error'); return; }
    }
    if (isImage && f.size > 20 * 1024 * 1024) {
      setError('This image is larger than 20 MB.');
      setPhase('error');
      return;
    }
    setError('');
    setPhase('uploading');
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: f });
      setPhase('processing');
      let meta = { fileSize: f.size };
      let thumbUri = '';
      if (isVideo) {
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
        const m = await extractVideoMetadata(signed_url);
        meta = { ...meta, duration: m?.duration || null, width: m?.width || null, height: m?.height || null };
        setPreviewUrl(signed_url);
        try {
          const blob = await generateThumbnailBlob(signed_url);
          if (blob) {
            const up = await base44.integrations.Core.UploadPrivateFile({ file: blob });
            thumbUri = up.file_uri;
            const s2 = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: thumbUri, expires_in: 3600 });
            setPosterUrl(s2.signed_url);
          }
        } catch { /* thumbnail is best-effort */ }
      } else {
        const url = URL.createObjectURL(f);
        const img = await new Promise((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = () => res(null);
          i.src = url;
        });
        meta = { ...meta, width: img?.naturalWidth || null, height: img?.naturalHeight || null };
        setPreviewUrl(url);
        setPosterUrl('');
      }
      onChange({
        file_uri, thumbnail_uri: thumbUri, meta,
        name: f.name, size: f.size, kind: isVideo ? 'video' : 'image',
      });
      base44.analytics.track({ eventName: 'asset_uploaded' });
      setPhase('idle');
    } catch {
      setError('Upload failed. Your file was not added — please try again.');
      setPhase('error');
    }
  };

  const validationErrors = value ? mediaValidationErrors(value, reqs) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold">Final submission</p>
          <p className="text-xs text-muted-foreground">The finished creative the brand will review.</p>
        </div>
        {value && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Final</span>}
      </div>

      {!value && (phase === 'uploading' || phase === 'processing' ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm font-medium">{phase === 'uploading' ? 'Uploading your creative…' : 'Processing your video…'}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {phase === 'uploading' ? 'Storing to private storage.' : 'Extracting duration, resolution and preview.'}
          </p>
        </div>
      ) : (
        <MediaUploader
          label="Upload your final creative"
          hint="Drag and drop, or browse — video or image. Stored privately."
          accept="video/*,image/*"
          onFiles={(files) => handleFile(files[0])}
        />
      ))}

      {value && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden animate-fade-in">
          <div className="aspect-video bg-secondary/60 flex items-center justify-center">
            {value.kind === 'video' ? (
              previewUrl ? (
                <video src={previewUrl} poster={posterUrl || undefined} controls className="w-full h-full" />
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Preparing preview…</div>
              )
            ) : previewUrl ? (
              <img src={previewUrl} alt={value.name} className="max-h-full max-w-full object-contain" />
            ) : null}
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              {value.kind === 'video'
                ? <Film className="w-4 h-4 text-primary shrink-0" />
                : <ImageIcon className="w-4 h-4 text-primary shrink-0" />}
              <p className="text-sm font-medium truncate">{value.name}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Meta label="Duration" value={value.kind === 'video' ? formatDuration(value.meta?.duration) : '—'} />
              <Meta label="Resolution" value={resolutionLabel(value.meta?.width, value.meta?.height)} />
              <Meta label="Aspect" value={value.meta?.width && value.meta?.height ? `${(value.meta.width / value.meta.height).toFixed(2)}` : '—'} />
              <Meta label="File size" value={formatBytes(value.size || value.meta?.fileSize)} />
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => { onChange(null); setPreviewUrl(''); setPosterUrl(''); setPhase('idle'); setError(''); }}
                className="text-xs font-medium inline-flex items-center gap-1.5 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
              {phase === 'idle' && (
                <label className="text-xs font-medium inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                  <RotateCcw className="w-3.5 h-3.5" /> Replace
                  <input type="file" accept="video/*,image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              )}
              {previewUrl && value.kind === 'video' && (
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors">
                  <UploadCloud className="w-3.5 h-3.5 rotate-180" /> Open preview
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {(phase === 'uploading' || phase === 'processing') && value && (
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Updating your final creative…</p>
      )}

      {(error || validationErrors.length > 0) && (
        <div className="mt-3 space-y-1.5">
          {error && (
            <p role="alert" className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </p>
          )}
          {validationErrors.map((e) => (
            <p key={e} role="alert" className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {e}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div className="bg-secondary/40 rounded-xl px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xs font-semibold">{value}</p>
    </div>
  );
}