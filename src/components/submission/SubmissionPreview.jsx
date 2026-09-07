import { Clock, Monitor, Package, Layers } from 'lucide-react';
import { formatDuration, formatBytes, resolutionLabel } from '@/lib/submission-utils';

export default function SubmissionPreview({ src, poster, duration, width, height, fileSize, version }) {
  return (
    <div>
      <div className="aspect-video bg-card border border-border rounded-2xl overflow-hidden">
        {src ? (
          <video src={src} poster={poster || undefined} controls className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            No preview available
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Meta icon={Clock} label="Duration" value={formatDuration(duration)} />
        <Meta icon={Monitor} label="Resolution" value={resolutionLabel(width, height)} />
        <Meta icon={Package} label="File size" value={formatBytes(fileSize)} />
        <Meta icon={Layers} label="Version" value={version || '—'} />
      </div>
    </div>
  );
}

function Meta({ icon: Icon, label, value }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}