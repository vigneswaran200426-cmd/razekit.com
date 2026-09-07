import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Send, Trophy, ImagePlus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getUserProfile } from '@/lib/username-utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export default function CreateCommunityPostModal({ open, onClose, onPublished, editing }) {
  const [image, setImage] = useState('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [wonContests, setWonContests] = useState([]);
  const [selectedContestId, setSelectedContestId] = useState('');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const fileRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) { setImage(''); setCaption(''); setSelectedContestId(''); return; }
    (async () => {
      const me = await base44.auth.me().catch(() => null);
      setUser(me);
      if (me?.id) {
        const p = await getUserProfile(me.id);
        setProfile(p);
        const cs = await base44.entities.Contest.list('-created_date', 100).catch(() => []);
        setWonContests(cs.filter(c => c.winner_user_id === me.id && ['winner_selected', 'completed'].includes(c.status)));
      }
      if (editing) {
        setImage(editing.media_url || '');
        setCaption(editing.caption || editing.body || '');
        setSelectedContestId(editing.contest_id || '');
      }
    })();
  }, [open, editing]);

  if (!open) return null;

  const selectedContest = wonContests.find(c => c.id === selectedContestId);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Image only', description: 'Please choose an image file.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const r = await base44.integrations.Core.UploadFile({ file });
      setImage(r.file_url);
    } catch { toast({ title: 'Upload failed', variant: 'destructive' }); }
    finally { setUploading(false); }
  };

  const publish = async () => {
    if (!user) return;
    if (!image) { toast({ title: 'Add an image', variant: 'destructive' }); return; }
    setPublishing(true);
    try {
      const postType = selectedContest ? 'showcase' : 'image';
      const payload = {
        author_id: user.id,
        author_name: user.full_name || profile?.display_name || 'Creator',
        author_username: profile?.username || 'unknown',
        author_avatar: profile?.avatar_url || '',
        post_type: postType,
        type: 'image',
        media_url: image,
        title: '',
        body: '',
        caption: caption.trim(),
        hashtags: '',
        category: selectedContest ? 'Contest Winning Videos' : 'Edited Videos',
        contest_id: selectedContestId || '',
        submission_id: selectedContest?.winner_submission_id || '',
        is_system_generated: false,
        moderation_status: 'visible',
        likes_count: 0, comments_count: 0, shares_count: 0, views_count: 0, saves_count: 0,
        status: 'published',
      };
      if (editing) {
        await base44.entities.Post.update(editing.id, {
          caption: payload.caption, media_url: payload.media_url,
          contest_id: payload.contest_id, submission_id: payload.submission_id, post_type: payload.post_type,
        });
      } else {
        await base44.entities.Post.create(payload);
      }
      toast({ title: 'Posted successfully.' });
      onPublished?.();
      onClose();
    } catch (e) { toast({ title: 'Failed to post', description: e.message, variant: 'destructive' }); }
    finally { setPublishing(false); }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative min-h-screen flex items-start justify-center py-4" onClick={e => e.stopPropagation()}>
        <div className="bg-card border border-border rounded-t-2xl w-full max-w-md">
          <div className="sticky top-0 bg-card/90 backdrop-blur-sm flex items-center justify-between p-4 border-b border-border z-10 rounded-t-2xl">
            <h2 className="font-heading font-bold">{editing ? 'Edit Post' : 'Create Post'}</h2>
            <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>

          <div className="p-4 space-y-4">
            {!image ? (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="aspect-video w-full rounded-xl border-2 border-dashed border-border bg-secondary/30 flex flex-col items-center justify-center hover:border-primary/40 disabled:opacity-60">
                {uploading ? (
                  <><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="text-sm font-medium mt-2">Uploading image...</span></>
                ) : (
                  <><ImagePlus className="w-8 h-8 text-muted-foreground" /><span className="text-sm font-medium mt-2">Select Image</span><span className="text-xs text-muted-foreground mt-0.5">Image only</span></>
                )}
              </button>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-secondary">
                <img src={image} alt="preview" className="w-full max-h-80 object-contain" />
                {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-white" /></div>}
                <div className="absolute top-2 right-2 flex gap-2">
                  <button onClick={() => fileRef.current?.click()} className="px-2.5 py-1 rounded-lg bg-black/60 text-white text-xs">Replace</button>
                  <button onClick={() => setImage('')} className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
                </div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />

            <div className="space-y-2">
              <p className="text-sm font-medium">Caption</p>
              <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3} placeholder="Write a caption..." className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>

            {wonContests.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Link a verified win (optional)</p>
                <p className="text-xs text-muted-foreground">Only contests you actually won are shown. The prize is pulled from the contest record — you can't type it manually.</p>
                <select value={selectedContestId} onChange={e => setSelectedContestId(e.target.value)} className="w-full h-10 rounded-lg border border-input bg-transparent px-3 text-sm">
                  <option value="">Not a verified win</option>
                  {wonContests.map(c => <option key={c.id} value={c.id} className="bg-card">{c.title} · ₹{(c.prize_amount || 0).toLocaleString('en-IN')}</option>)}
                </select>
                {selectedContest && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                    <Trophy className="w-4 h-4" /> This post will show a 🏆 VERIFIED WIN badge.
                  </div>
                )}
              </div>
            )}

            <Button onClick={publish} disabled={publishing || uploading || !image} className="w-full h-11">
              {publishing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Publishing...</> : <><Send className="w-4 h-4 mr-2" />{editing ? 'Save' : 'Post'}</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}