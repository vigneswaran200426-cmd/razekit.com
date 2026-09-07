import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

// Generic drag-and-drop uploader used across the submission workspace
// (final creative, source files, covers). Specialised validation lives
// in the caller — this component only moves files.
export default function MediaUploader({
  label = 'Upload file',
  hint,
  accept = '*/*',
  multiple = false,
  compact = false,
  onFiles,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const open = () => inputRef.current?.click();
  const handle = (list) => {
    const files = Array.from(list || []).filter(Boolean);
    if (files.length) onFiles(multiple ? files : [files[0]]);
  };

  return (
    <div
      onClick={open}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer?.files); }}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      className={`cursor-pointer rounded-2xl border-2 border-dashed text-center transition-colors ${
        compact ? 'py-4 px-3' : 'py-10 px-6'
      } ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-secondary/40'}`}
    >
      <div className={compact ? 'flex items-center justify-center gap-2' : ''}>
        {!compact && (
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <UploadCloud className="w-6 h-6 text-primary" />
          </div>
        )}
        {compact && <UploadCloud className="w-4 h-4 text-primary shrink-0" />}
        <div className={compact ? 'text-left min-w-0' : ''}>
          <p className={`font-medium ${compact ? 'text-xs' : 'font-heading text-base mb-1'}`}>{label}</p>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => { handle(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}