import { useState, useEffect } from 'react';
import { X, Heart, Send, CornerDownRight, BadgeCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { timeAgo, getCreatorByUsername } from './feedData';

const SORTS = ['Top', 'Newest', 'Oldest'];

export default function CommentsSheet({ post, open, onClose }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [likedComments, setLikedComments] = useState({});
  const [sort, setSort] = useState('Top');

  useEffect(() => {
    if (open && post) {
      base44.auth.me().catch(() => null).then(setUser);
      base44.entities.Comment.filter({ post_id: post.id }, '-created_date', 50)
        .then(setComments)
        .catch(() => setComments([]))
        .finally(() => setLoading(false));
    }
  }, [open, post]);

  if (!open) return null;

  const topLevel = comments.filter(c => !c.parent_id);
  const getReplies = (id) => comments.filter(c => c.parent_id === id);

  const sorted = [...topLevel].sort((a, b) => {
    if (sort === 'Top') return (b.likes_count || 0) - (a.likes_count || 0);
    if (sort === 'Newest') return new Date(b.created_date) - new Date(a.created_date);
    if (sort === 'Oldest') return new Date(a.created_date) - new Date(b.created_date);
    return 0;
  });

  const handleSubmit = async () => {
    if (!text.trim()) return;
    const newComment = {
      post_id: post.id,
      author_id: user?.id || 'guest',
      author_name: user?.full_name || user?.email?.split('@')[0] || 'You',
      author_username: user?.username || 'you',
      text: text.trim(),
      parent_id: replyTo?.id || null,
      likes_count: 0,
    };
    try {
      const created = await base44.entities.Comment.create(newComment);
      setComments([created, ...comments]);
    } catch {
      setComments([{ ...newComment, id: `local-${Date.now()}`, created_date: new Date().toISOString() }, ...comments]);
    }
    setText('');
    setReplyTo(null);
  };

  const toggleLike = (id) => {
    setLikedComments(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const CommentItem = ({ comment, isReply }) => (
    <div className={`flex gap-2.5 ${isReply ? 'ml-10' : ''}`}>
      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
        <span className="font-heading text-xs font-bold text-primary">{comment.author_name?.[0]}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-secondary/50 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs font-medium">{comment.author_name}</span>
            {getCreatorByUsername(comment.author_username)?.verified && <BadgeCheck className="w-3 h-3 text-primary" />}
            <span className="text-[10px] text-primary">@{comment.author_username}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(comment.created_date)}</span>
          </div>
          <p className="text-sm">
            {comment.text.split(/(@\w+)/g).map((part, i) =>
              part.startsWith('@') ? <span key={i} className="text-primary">{part}</span> : part
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1 ml-1">
          <button onClick={() => toggleLike(comment.id)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors">
            <Heart className={`w-3 h-3 ${likedComments[comment.id] ? 'fill-destructive text-destructive' : ''}`} />
            {(comment.likes_count || 0) + (likedComments[comment.id] ? 1 : 0)}
          </button>
          <button onClick={() => setReplyTo(comment)} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Reply</button>
        </div>
        {!isReply && getReplies(comment.id).length > 0 && (
          <div className="mt-2 space-y-2">
            {getReplies(comment.id).map(reply => <CommentItem key={reply.id} comment={reply} isReply />)}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-card border border-border rounded-t-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h3 className="font-heading font-semibold">Comments ({comments.length})</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        {/* Sort */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
          <span className="text-xs text-muted-foreground">Sort:</span>
          {SORTS.map(s => (
            <button key={s} onClick={() => setSort(s)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${sort === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Loading comments...</p>
          ) : sorted.length > 0 ? (
            sorted.map(c => <CommentItem key={c.id} comment={c} />)
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">Be the first to comment!</p>
          )}
        </div>
        <div className="p-3 border-t border-border shrink-0">
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <CornerDownRight className="w-3 h-3" />
              Replying to @{replyTo.author_username}
              <button onClick={() => setReplyTo(null)} className="text-primary">Cancel</button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Add a comment... use @ to mention"
              className="flex-1 h-10 rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button onClick={handleSubmit} disabled={!text.trim()} className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}