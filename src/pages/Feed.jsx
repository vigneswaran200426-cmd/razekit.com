import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Heart, MessageCircle, Bookmark, Plus, ImagePlus, Loader2 } from 'lucide-react';
import { entities, uploads } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateShort } from '@/lib/format';
import { PageHeader, Card, Button, Badge, Avatar, EmptyState, Skeleton, Input, Sheet } from '@/components/ui';
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
            ? <video src={post.media_url} controls preload="metadata" className="w-full max-h-[540px]" />
            : <img src={post.media_url} alt={post.title || ''} loading="lazy" decoding="async" className="w-full max-h-[540px] object-contain" />}
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

  // This was the only hand-rolled overlay left in the product: a bare div with
  // an onClick, no role="dialog", no aria-modal, no accessible name, no Escape
  // handler, no focus move and no scroll lock. A keyboard user tabbed straight
  // through it into the page behind and could not dismiss it without a mouse;
  // a screen-reader user was never told a dialog had opened. Sheet already
  // provides every one of those, plus a 44px close target and the
  // bottom-sheet-on-mobile behaviour the rest of the product uses.
  return (
    <Sheet
      open
      onClose={onClose}
      title="Share your work"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={!mediaUrl && !caption.trim()} onClick={submit}>Post</Button>
        </div>
      )}
    >
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={onFile} />
        {mediaUrl ? (
          <div className="relative rounded-md overflow-hidden border border-line mb-3">
            {/\.(mp4|webm|mov)/i.test(mediaUrl) ? <video src={mediaUrl} preload="metadata" className="w-full max-h-64 bg-surface-2" /> : <img src={mediaUrl} alt="" className="w-full max-h-64 object-contain bg-surface-2" />}
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full rounded-md border-2 border-dashed border-line-strong bg-surface-2/40 py-8 flex flex-col items-center gap-2 text-muted hover:border-primary/50 hover:text-ink transition-colors mb-3">
            {uploading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <ImagePlus className="w-6 h-6" />}<span className="text-sm font-medium">{uploading ? 'Uploading…' : 'Add image or video'}</span>
          </button>
        )}
        <label htmlFor="feed-title" className="sr-only">Title</label>
        <Input id="feed-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="mb-2" />
        <label htmlFor="feed-caption" className="sr-only">Say something about your work</label>
        <textarea id="feed-caption" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Say something about it…"
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
    </Sheet>
  );
}

export default function Feed() {
  const { user, status } = useAuth();
  const [posts, setPosts] = useState(null);
  const [likedIds, setLikedIds] = useState(new Set());
  const [showCreate, setShowCreate] = useState(false);
  // A failed read used to land in `setPosts([])`, and an empty array is drawn as
  // "No posts yet" — the product asserting that the community has posted nothing
  // when all it actually knows is that the request never came back. "We don't
  // know" is its own state, so it gets its own surface and its own way out.
  const [loadErr, setLoadErr] = useState('');

  const load = useCallback(async () => {
    setLoadErr('');
    // Started before the feed is awaited so the two reads still overlap. Which
    // posts you have already liked is decoration on the feed rather than the
    // feed itself, so its failure stays quiet instead of taking the screen down.
    if (user?.id) entities.PostLike.filter({ user_id: user.id }, '-created_date', 200).then((l) => setLikedIds(new Set((l || []).map((x) => x.post_id)))).catch(() => {});
    try {
      const l = await entities.Post.list('-created_date', 50);
      setPosts((l || []).filter((p) => p.moderation_status !== 'removed' && p.status !== 'removed'));
    } catch (e) {
      setLoadErr(e?.data?.error?.message || e?.message || 'The feed did not come back. Check your connection and try again.');
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

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
      {loadErr ? (
        // Checked before the loading gate: on a failure `posts` is still null,
        // and the shimmer would otherwise run forever on a request that is
        // already over.
        <div role="alert" className="rounded-lg border border-danger/30 bg-surface px-5 py-8 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-md bg-danger/10 text-danger"><AlertCircle className="h-5 w-5" aria-hidden="true" /></div>
          <h3 className="font-display text-base font-bold text-ink">We couldn’t load the feed</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">{loadErr}</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">Nothing was posted, removed or changed — only this list failed to arrive.</p>
          <div className="mt-4 flex justify-center"><Button variant="secondary" onClick={load}>Try again</Button></div>
        </div>
      ) : !posts ? (
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
