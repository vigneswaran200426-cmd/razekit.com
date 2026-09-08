import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Bookmark, Plus, ImagePlus, X, Loader2 } from 'lucide-react';
import { entities, uploads } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { initials, dateShort } from '@/lib/format';
import { PageHeader, Card, Button, Badge, Avatar, EmptyState, Skeleton, Input } from '@/components/ui';
import { cn } from '@/lib/cn';

function PostCard({ post, liked, onLike }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-3.5">
        <Link to={post.author_id ? `/u/${post.author_id}` : '#'}><Avatar name={post.author_name || post.author_username} src={post.author_avatar} size={40} /></Link>
        <div className="min-w-0 flex-1">
          <Link to={post.author_id ? `/u/${post.author_id}` : '#'} className="font-semibold text-sm text-ink hover:text-primary transition-colors truncate block">{post.author_name || post.author_username || 'Creator'}</Link>
          <p className="text-xs text-muted">{post.author_username ? `@${post.author_username}` : ''} · {dateShort(post.created_date)}</p>
        </div>
        {post.category && <Badge tone="neutral">{post.category}</Badge>}
      </div>
      {post.media_url && (
        <div className="bg-ink">
          {/\.(mp4|webm|mov)/i.test(post.media_url)
            ? <video src={post.media_url} controls className="w-full max-h-[540px]" />
            : <img src={post.media_url} alt={post.title || ''} className="w-full max-h-[540px] object-contain" />}
        </div>
      )}
      <div className="p-3.5">
        {post.title && <p className="font-display font-bold text-ink">{post.title}</p>}
        {(post.caption || post.body) && <p className="text-sm text-ink/90 mt-1 leading-relaxed whitespace-pre-line">{post.caption || post.body}</p>}
        <div className="flex items-center gap-5 mt-3 pt-3 border-t border-line text-sm text-muted">
          <button onClick={() => onLike(post)} className={cn('flex items-center gap-1.5 transition-colors', liked ? 'text-danger' : 'hover:text-ink')}>
            <Heart className={cn('w-4.5 h-4.5', liked && 'fill-danger')} style={{ width: 18, height: 18 }} /> <span className="nums">{post.likes_count || 0}</span>
          </button>
          <span className="flex items-center gap-1.5"><MessageCircle style={{ width: 18, height: 18 }} /> <span className="nums">{post.comments_count || 0}</span></span>
          <span className="flex items-center gap-1.5 ml-auto"><Bookmark style={{ width: 18, height: 18 }} /> <span className="nums">{post.saves_count || 0}</span></span>
        </div>
      </div>
    </Card>
  );
}

function CreateModal({ onClose, onCreated }) {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try { const { file_url } = await uploads.file(file); setMediaUrl(file_url); } finally { setUploading(false); }
  };
  const submit = async () => {
    if (!mediaUrl && !caption.trim()) return;
    setSaving(true);
    try {
      const post = await entities.Post.create({
        author_id: user.id, author_name: user.full_name || user.email, author_username: user.username || '', author_avatar: user.avatar_url || '',
        media_url: mediaUrl, title: title.trim(), caption: caption.trim(), type: 'showcase', post_type: 'showcase', status: 'published', moderation_status: 'visible',
        likes_count: 0, comments_count: 0, saves_count: 0,
      });
      onCreated(post); onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 backdrop-blur-sm p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="font-display text-lg font-bold text-ink">Share your work</h2><button onClick={onClose} className="text-muted hover:text-ink"><X className="w-5 h-5" /></button></div>
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={onFile} />
        {mediaUrl ? (
          <div className="relative rounded-md overflow-hidden border border-line mb-3">
            {/\.(mp4|webm|mov)/i.test(mediaUrl) ? <video src={mediaUrl} className="w-full max-h-64 bg-surface-2" /> : <img src={mediaUrl} alt="" className="w-full max-h-64 object-contain bg-surface-2" />}
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full rounded-md border-2 border-dashed border-line-strong bg-surface-2/40 py-8 flex flex-col items-center gap-2 text-muted hover:border-primary/50 hover:text-ink transition-colors mb-3">
            {uploading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <ImagePlus className="w-6 h-6" />}<span className="text-sm font-medium">{uploading ? 'Uploading…' : 'Add image or video'}</span>
          </button>
        )}
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="mb-2" />
        <textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Say something about it…"
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        <div className="flex justify-end gap-2 mt-4"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!mediaUrl && !caption.trim()} onClick={submit}>Post</Button></div>
      </Card>
    </div>
  );
}

export default function Feed() {
  const { user, status } = useAuth();
  const [posts, setPosts] = useState(null);
  const [likedIds, setLikedIds] = useState(new Set());
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    entities.Post.list('-created_date', 50).then((l) => setPosts((l || []).filter((p) => p.moderation_status !== 'removed' && p.status !== 'removed'))).catch(() => setPosts([]));
    if (user?.id) entities.PostLike.filter({ user_id: user.id }, '-created_date', 200).then((l) => setLikedIds(new Set((l || []).map((x) => x.post_id)))).catch(() => {});
  }, [user?.id]);

  const toggleLike = async (post) => {
    if (!user) return;
    const liked = likedIds.has(post.id);
    setLikedIds((prev) => { const n = new Set(prev); liked ? n.delete(post.id) : n.add(post.id); return n; });
    setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, likes_count: (p.likes_count || 0) + (liked ? -1 : 1) } : p));
    try {
      if (liked) { const mine = await entities.PostLike.filter({ user_id: user.id, post_id: post.id }, '-created_date', 1); if (mine[0]) await entities.PostLike.remove(mine[0].id); }
      else await entities.PostLike.create({ user_id: user.id, post_id: post.id });
      await entities.Post.update(post.id, { likes_count: Math.max(0, (post.likes_count || 0) + (liked ? -1 : 1)) }).catch(() => {});
    } catch {}
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader eyebrow="Community" title="Feed" description="Winning work and creator showcases from across RazeKit."
        actions={status === 'authenticated' && <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />Share work</Button>} />
      {!posts ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80" />)}</div>
      ) : posts.length ? (
        <div className="space-y-4">{posts.map((p) => <PostCard key={p.id} post={p} liked={likedIds.has(p.id)} onLike={toggleLike} />)}</div>
      ) : (
        <EmptyState icon={ImagePlus} title="No posts yet" description="Be the first to share your creative work with the community."
          action={status === 'authenticated' ? <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" />Share work</Button> : <Button to="/login">Sign in to post</Button>} />
      )}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={(p) => setPosts((prev) => [p, ...(prev || [])])} />}
    </div>
  );
}
