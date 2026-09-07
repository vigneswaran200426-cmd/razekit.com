export const MAX_VIDEO_MB = 500;
export const ACCEPTED_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv'];
export const ACCEPTED_MIME = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];

// Client-side validation. Backend (RLS + storage) is the authoritative gate,
// so this is a fast first-pass check, never the only check.
export function validateVideoFile(file, maxMb = MAX_VIDEO_MB) {
  if (!file) return { ok: false, error: 'No file selected.' };
  const typeOk =
    (file.type && ACCEPTED_MIME.includes(file.type)) ||
    ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith('.' + ext));
  if (!typeOk) return { ok: false, error: 'Unsupported format. Please use MP4, MOV, or WebM.' };
  if (file.size === 0) return { ok: false, error: 'File appears to be empty.' };
  if (file.size > maxMb * 1024 * 1024)
    return { ok: false, error: `File is too large. Maximum is ${maxMb} MB.` };
  return { ok: true };
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(sec) {
  if (!sec || !isFinite(sec)) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
}

export function resolutionLabel(w, h) {
  if (!w || !h) return '—';
  return `${w}×${h}`;
}

// Extract duration + dimensions from a video source via a hidden <video>.
export function extractVideoMetadata(src) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = src;
    const done = (val) => { v.removeAttribute('src'); resolve(val); };
    v.onloadedmetadata = () =>
      done({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => done(null);
    setTimeout(() => done(null), 15000);
  });
}

// Generate a JPEG thumbnail by seeking the video and drawing a frame to canvas.
// Degrades gracefully (resolves null) if CORS taints the canvas or seeking fails.
export function generateThumbnailBlob(src) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.src = src;
    v.muted = true;
    v.crossOrigin = 'anonymous';
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      v.removeAttribute('src');
      resolve(val);
    };
    v.onloadedmetadata = () => {
      try {
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
      } catch {
        done(null);
      }
    };
    v.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || 320;
        canvas.height = v.videoHeight || 180;
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => done(b || null), 'image/jpeg', 0.8);
      } catch {
        done(null);
      }
    };
    v.onerror = () => done(null);
    setTimeout(() => done(null), 20000);
  });
}