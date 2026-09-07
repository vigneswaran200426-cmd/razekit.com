import { Film, X } from 'lucide-react';
import { formatBytes } from '@/lib/submission-utils';

export default function UploadProgress({ file, progress, speed, onCancel, cancelled }) {
  const pct = Math.min(100, Math.round(progress || 0));
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Film className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[200px]">{file?.name || 'Video'}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatBytes(file?.size)}{speed ? ` · ${speed}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onCancel}
          disabled={cancelled}
          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 disabled:opacity-50"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-primary transition-all duration-200" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        {cancelled ? 'Cancelling…' : `${pct}% uploaded`}
      </p>
    </div>
  );
}