import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Resolve a winner publish record's playable media URL.
// Public URL after publishing; temporary signed URL while under review.
async function resolveMediaUrl(uri) {
  if (!uri) return null;
  if (/^https?:\/\//.test(uri)) return uri;
  try {
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
    return signed_url;
  } catch { return null; }
}

// Media hero — the winning creative IS the visual. Minimal UI on top.
export default function WinnerMedia({ publish, className = '', onPlay }) {
  const [url, setUrl] = useState(null);
  const [poster, setPoster] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    (async () => {
      const u = await resolveMediaUrl(publish?.media_url || publish?.media_uri);
      const p = await resolveMediaUrl(publish?.thumbnail_url || publish?.thumbnail_uri);
      if (active) { setUrl(u); setPoster(p); if (!u) setError(true); }
    })();
    return () => { active = false; };
  }, [publish?.media_url, publish?.media_uri, publish?.thumbnail_url, publish?.thumbnail_uri]);

  if (error || !url) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 ${className}`}>
        <Film className="w-8 h-8 text-primary/50" />
      </div>
    );
  }
  if (publish.media_type === 'image') {
    return <img src={url} alt={publish.title || 'Winning work'} className={`w-full h-full object-cover ${className}`} />;
  }
  return (
    <video
      src={url}
      poster={poster || undefined}
      controls
      playsInline
      preload="metadata"
      onPlay={() => onPlay?.()}
      className={`w-full h-full object-cover ${className}`}
    />
  );
}

// Poster/thumbnail-only preview for cards (no video load until detail page).
export function useWinnerPoster(publish) {
  const [poster, setPoster] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const p = await resolveMediaUrl(publish?.thumbnail_url || publish?.thumbnail_uri || publish?.media_url || publish?.media_uri);
      if (active) setPoster(p);
    })();
    return () => { active = false; };
  }, [publish?.thumbnail_url, publish?.thumbnail_uri, publish?.media_url, publish?.media_uri]);
  return poster;
}