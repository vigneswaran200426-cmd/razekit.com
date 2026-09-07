import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import CommunityPostCard from '@/components/community/CommunityPostCard';
import CommentThread from '@/components/community/CommentThread';
import ReportModal from '@/components/community/ReportModal';
import CreateCommunityPostModal from '@/components/community/CreateCommunityPostModal';
import { isVerifiedWin } from '@/lib/community-utils';
import { ArrowLeft, Loader2, MessageCircle } from 'lucide-react';

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [contest, setContest] = useState(null);
  const [likes, setLikes] = useState([]);
  const [comments, setComments] = useState([]);
  const [saves, setSaves] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const [me, p] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.Post.get(id).catch(() => null),
      ]);
      setUser(me);
      setPost(p);
      if (p?.contest_id) setContest(await base44.entities.Contest.get(p.contest_id).catch(() => null));
      const [lk, cm] = await Promise.all([
        base44.entities.PostLike.filter({ post_id: id }, '-created_date', 500).catch(() => []),
        base44.entities.Comment.filter({ post_id: id }, '-created_date', 500).catch(() => []),
      ]);
      setLikes(lk);
      setComments(cm.filter(c => c.moderation_status !== 'removed'));
      if (me?.id) setSaves(await base44.entities.PostSave.filter({ user_id: me.id }, '-created_date', 200).catch(() => []));
    } catch {} finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const likeCount = new Set(likes.map(l => l.user_id)).size;
  const liked = likes.some(l => l.user_id === user?.id);
  const commentCount = comments.length;
  const saved = saves.some(s => s.post_id === id);
  const isOwner = user?.id === post?.created_by_id;

  const handleLike = async () => {
    if (!user) { navigate('/login'); return; }
    const existing = likes.filter(l => l.user_id === user.id);
    if (existing.length) {
      setLikes(prev => prev.filter(l => l.user_id !== user.id));
      try { await Promise.all(existing.map(l => base44.entities.PostLike.delete(l.id).catch(() => {}))); } catch {}
    } else {
      const tempId = `opt-${user.id}`;
      setLikes(prev => [{ id: tempId, user_id: user.id, post_id: id }, ...prev]);
      try {
        const created = await base44.entities.PostLike.create({ user_id: user.id, post_id: id });
        setLikes(prev => prev.map(l => l.id === tempId ? created : l));
      } catch {
        setLikes(prev => prev.filter(l => l.id !== tempId));
        toast({ title: 'Action failed', variant: 'destructive' });
      }
    }
  };

  const handleSave = async () => {
    const existing = saves.find(s => s.post_id === id);
    if (existing) {
      setSaves(prev => prev.filter(s => s.id !== existing.id));
      await base44.entities.PostSave.delete(existing.id).catch(() => {});
    } else {
      const created = await base44.entities.PostSave.create({ user_id: user.id, post_id: id }).catch(() => null);
      if (created) setSaves(prev => [created, ...prev]);
    }
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/community/post/${id}`).catch(() => {});
    toast({ title: 'Link copied' });
  };

  const handleDelete = async () => {
    if (!confirm('Delete this post?')) return;
    try { await base44.entities.Post.delete(id); toast({ title: 'Post deleted' }); navigate('/winners-hub'); }
    catch (e) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>;
  if (!post) return (
    <div className="p-8 text-center">
      <p className="text-muted-foreground mb-3">Post not found or removed.</p>
      <Link to="/winners-hub" className="text-primary hover:underline text-sm">Back to community</Link>
    </div>
  );

  return (
    <div className="pb-8">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
          <h1 className="font-heading font-bold text-lg">Post</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <CommunityPostCard
          post={post}
          contest={contest}
          liked={liked}
          saved={saved}
          likeCount={likeCount}
          commentCount={commentCount}
          isOwner={isOwner}
          onLike={handleLike}
          onSave={handleSave}
          onShare={handleShare}
          onReport={() => setReportOpen(true)}
          onEdit={() => setEditing(post)}
          onDelete={handleDelete}
          onOpen={() => {}}
          onProfile={() => post.author_username && navigate(`/u/${post.author_username}`)}
        />

        {isVerifiedWin(post, contest) && contest && (
          <Link to={`/contest/${contest.id}`} className="block bg-card border border-border rounded-2xl p-4 hover:border-primary/40">
            <p className="text-xs text-muted-foreground mb-1">Winning project</p>
            <p className="font-medium text-sm">{contest.title}</p>
            <p className="text-xs text-muted-foreground">{contest.category} · ₹{(contest.prize_amount || 0).toLocaleString('en-IN')} prize</p>
          </Link>
        )}

        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h2 className="font-heading font-semibold flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Comments {commentCount > 0 && `(${commentCount})`}</h2>
          <CommentThread postId={id} user={user} />
        </div>
      </div>

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} targetType="post" targetId={id} user={user} />
      <CreateCommunityPostModal open={!!editing} onClose={() => setEditing(null)} onPublished={load} editing={editing} />
    </div>
  );
}