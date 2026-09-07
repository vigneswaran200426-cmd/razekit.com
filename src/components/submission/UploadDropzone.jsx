import { useRef, useState } from 'react';
import { UploadCloud, Film } from 'lucide-react';
import { ACCEPTED_EXTENSIONS, MAX_VIDEO_MB, validateVideoFile } from '@/lib/submission-utils';

export default function UploadDropzone({ onFile, maxMb = MAX_VIDEO_MB }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const handle = (file) => {
    const v = validateVideoFile(file, maxMb);
    if (!v.ok) {
      setError(v.error);
      onFile(null);
      return;
    }
    setError('');
    onFile(file);
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(e.dataTransfer.files?.[0]);
        }}
        className={`cursor-pointer rounded-2xl border-2 border-dashed transition-colors py-12 px-6 text-center ${
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-secondary/40'
        }`}
      >
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <UploadCloud className="w-7 h-7 text-primary" />
        </div>
        <p className="font-heading font-semibold text-base mb-1">Upload Video</p>
        <p className="text-sm text-muted-foreground mb-1">Drag and drop your video here</p>
        <p className="text-xs text-primary">Choose from device</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0])}
        />
      </div>
      <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Film className="w-3 h-3" /> {ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase()).join(', ')}
        </span>
        <span>Max {maxMb} MB</span>
      </div>
      {error && <p className="text-xs text-destructive mt-2 text-center">{error}</p>}
    </div>
  );
}