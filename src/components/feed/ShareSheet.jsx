import { X, Copy, CheckCheck } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const SHARE_OPTIONS = [
  { name: 'WhatsApp', color: '#25D366', letter: 'W', getUrl: (url, text) => `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}` },
  { name: 'Instagram', color: '#E4405F', letter: 'IG', getUrl: null },
  { name: 'Facebook', color: '#1877F2', letter: 'f', getUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { name: 'X', color: '#1a1a1a', letter: 'X', getUrl: (url, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
  { name: 'Telegram', color: '#0088cc', letter: 'T', getUrl: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
];

export default function ShareSheet({ open, onClose, url, title }) {
  if (!open) return null;

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const shareText = title || 'Check out this post!';

  const handleShare = (option) => {
    if (option.getUrl) {
      window.open(option.getUrl(shareUrl, shareText), '_blank', 'noopener,noreferrer');
    } else {
      toast({ title: `Share to ${option.name}`, description: 'Open the app and paste the link.' });
    }
    onClose();
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      toast({ title: 'Link copied to clipboard' });
    }).catch(() => {
      toast({ title: 'Could not copy link' });
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-card border border-border rounded-t-2xl w-full max-w-md p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold">Share</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="grid grid-cols-5 gap-3 mb-4">
          {SHARE_OPTIONS.map(opt => (
            <button key={opt.name} onClick={() => handleShare(opt)} className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: opt.color }}>
                {opt.letter}
              </div>
              <span className="text-[10px] text-muted-foreground">{opt.name}</span>
            </button>
          ))}
        </div>
        <button onClick={copyLink} className="w-full flex items-center gap-2 p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors">
          <Copy className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm flex-1 text-left">Copy Link</span>
          <CheckCheck className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}