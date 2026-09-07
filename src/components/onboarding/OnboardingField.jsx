import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';

export default function OnboardingField({ field, value, onChange, error }) {
  const [uploading, setUploading] = useState(false);

  if (field.type === 'chips') {
    const selected = value ? value.split(',').filter(Boolean) : [];
    const toggle = (opt) => {
      const next = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt];
      onChange(next.join(','));
    };
    return (
      <div>
        <Label className="mb-2 block">
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
        <div className="flex flex-wrap gap-2">
          {field.options.map((opt) => {
            const on = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  on
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/40'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <Label className="mb-1.5 block">
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
        <Textarea value={value || ''} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.label} />
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === 'image') {
    return (
      <div>
        <Label className="mb-1.5 block">{field.label}</Label>
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-secondary border border-border overflow-hidden flex items-center justify-center shrink-0">
            {value ? (
              <img src={value} alt="" className="w-full h-full object-cover" />
            ) : (
              <Upload className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <label className="cursor-pointer text-sm text-primary hover:underline">
            {uploading ? 'Uploading…' : value ? 'Change' : 'Upload'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try {
                  const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
                  onChange(file_url);
                } catch {
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          {value && (
            <button onClick={() => onChange('')} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
              <X className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label className="mb-1.5 block">
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        type={field.type === 'tel' ? 'tel' : field.type === 'url' ? 'url' : 'text'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.label}
      />
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}