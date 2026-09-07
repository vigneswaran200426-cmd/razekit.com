import { useState } from 'react';
import { Lock, Loader2, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatBytes } from '@/lib/submission-utils';
import MediaUploader from './MediaUploader';

const ACCEPT = {
  raw: 'video/*,.mp4,.mov,.zip',
  project: '.zip,.rar,.7z,.prproj,.aep,.fcpxml,.drp,.capx,.vsp,.pdf',
  audio: 'audio/*,.wav,.mp3,.aiff,.m4a',
  thumbnail: 'image/*',
};

const rid = () => Math.random().toString(36).slice(2, 10);

// Dedicated source-files section — kept clearly separate from the FINAL
// SUBMISSION so creators never confuse the two. Uploads are private and
// shared with the brand according to the contest terms.
export default function SourceFilesSection({ reqs, value = [], onChange }) {
  const [uploadingType, setUploadingType] = useState(null);
  const [error, setError] = useState('');
  const rows = reqs.sourceFiles.filter((f) => f.id !== 'final');

  const addFiles = async (type, label, files) => {
    setError('');
    setUploadingType(type);
    const added = [];
    for (const f of files) {
      try {
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: f });
        added.push({ id: rid(), type, label, file_uri, name: f.name, size: f.size });
      } catch {
        setError(`"${f.name}" could not be uploaded. Please try again.`);
      }
    }
    if (added.length) {
      onChange([...value, ...added]);
      base44.analytics.track({ eventName: 'asset_uploaded' });
    }
    setUploadingType(null);
  };

  return (
    <div>
      <div className="mb-3">
        <p className="text-sm font-semibold">Source files</p>
        <p className="text-xs text-muted-foreground">Supporting files the brand may need — separate from your final creative.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground bg-card border border-border rounded-2xl px-4 py-3">
          This contest does not require source files. Only your final creative will be reviewed.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((f) => {
            const files = value.filter((s) => s.type === f.id);
            return (
              <div key={f.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium">{f.label}</p>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${f.required ? 'text-primary' : 'text-muted-foreground'}`}>
                    {f.required ? 'Required' : 'Optional'}
                  </span>
                </div>
                {f.desc && <p className="text-xs text-muted-foreground mb-2">{f.desc}</p>}
                {files.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {files.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-xl px-3 py-2">
                        <p className="text-xs font-medium truncate">{s.name}</p>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-muted-foreground">{formatBytes(s.size)}</span>
                          <button
                            aria-label={`Remove ${s.name}`}
                            onClick={() => onChange(value.filter((x) => x.id !== s.id))}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {uploadingType === f.id ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</p>
                ) : (
                  <MediaUploader
                    compact
                    label={files.length ? 'Add another file' : 'Add file'}
                    accept={ACCEPT[f.id] || '*/*'}
                    multiple
                    onFiles={(fs) => addFiles(f.id, f.label, fs)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 mt-3">
        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Source files are stored privately and shared with the Brand according to this contest&rsquo;s terms.
      </p>
      {error && <p role="alert" className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}