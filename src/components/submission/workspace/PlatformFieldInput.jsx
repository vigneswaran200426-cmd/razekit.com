import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fieldRequired } from '@/lib/submission/requirements';
import MediaUploader from './MediaUploader';

// Renders ONE platform field, generically, from its config.
// This is the only field renderer in the submission engine —
// every platform uses it; there are no per-platform components.

export default function PlatformFieldInput({ reqs, entry, field, onChange }) {
  const v = entry.fields?.[field.key] || '';
  const required = fieldRequired(reqs, field);
  const disabled = field.type === 'url' && entry.notPublished;
  const set = (val) => onChange(field.key, val);

  const uploadImage = async (f) => {
    set('__uploading__', true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: f });
      onChange(field.key, file_uri);
      onChange('__uploading__', false);
    } catch {
      onChange('__uploading__', false);
    }
  };

  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
        {field.label}
        {required && <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">Required</span>}
      </label>

      {field.type === 'image' ? (
        entry.fields?.__uploading__ ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</p>
        ) : v ? (
          <div className="flex items-center justify-between gap-2 bg-secondary/40 rounded-xl px-3 py-2">
            <p className="text-xs font-medium truncate">Image uploaded</p>
            <button onClick={() => set('')} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
          </div>
        ) : (
          <MediaUploader compact label="Upload image" accept="image/*" onFiles={(fs) => uploadImage(fs[0])} />
        )
      ) : field.type === 'select' ? (
        <div className="flex flex-wrap gap-2">
          {field.options.map((opt) => (
            <button
              key={opt}
              type="button"
              aria-pressed={v === opt}
              onClick={() => set(v === opt ? '' : opt)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                v === opt ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : field.type === 'caption' || field.type === 'textarea' ? (
        <div>
          <Textarea
            value={v}
            disabled={disabled}
            onChange={(e) => set(e.target.value)}
            rows={field.type === 'caption' ? 3 : 4}
            placeholder={field.placeholder || `Your ${field.label.toLowerCase()}`}
            aria-label={field.label}
            className="text-sm"
          />
          {field.charLimit && (
            <p className={`text-[10px] mt-1 text-right ${v.length > field.charLimit ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
              {v.length}/{field.charLimit}
            </p>
          )}
        </div>
      ) : (
        <div>
          <Input
            value={v}
            disabled={disabled}
            onChange={(e) => set(e.target.value)}
            placeholder={field.placeholder || field.label}
            aria-label={field.label}
            className="h-10"
          />
          {field.charLimit && (
            <p className={`text-[10px] mt-1 text-right ${v.length > field.charLimit ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
              {v.length}/{field.charLimit}
            </p>
          )}
          {field.type === 'url' && !entry.notPublished && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Razekit verifies URLs manually — you may be asked for supporting proof after submission.
            </p>
          )}
        </div>
      )}
    </div>
  );
}