import { useState } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, BadgeCheck, Play, MoreHorizontal, Flag, Edit, Trash2, Trophy } from 'lucide-react';
import { timeAgo, formatCount, isVerifiedWin } from '@/lib/community-utils';

export default function CommunityPostCard({
  post, contest, liked, saved, likeCount, commentCount, isOwner,
  onLike, onSave, onShare, onReport, onEdit, onDelete, onOpen, onProfile,
}) {
  const [menu, setMenu] = useState(false);
  const verified = isVerifiedWin(post, contest);
  const hasMedia = !!post.media_url;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <button onClick={onProfile} className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
          {post.author_avatar ? <img src={post.author_avatar} alt="" className="w-full h-full object-cover" /> : <span className="font-heading text-sm font-bold text-primary">{post.author_name?.[0] || '?'}</span>}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <button onClick={onProfile} className="font-medium text-sm truncate hover:underline">{post.author_name}</button>
            {post.author_verified && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
            {post.is_system_generated && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">SYSTEM</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {post.author_username && <span className="text-primary">@{post.author_username}</span>}
            <span>· {timeAgo(post.created_date)}</span>
          </div>
        </div>
        <div className="relative shrink-0">
          <button onClick={() => setMenu(!menu)} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center">
            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl w-44 z-30 py-1">
                <MenuItem icon={Share2} label="Share" onClick={() => { onShare?.(); setMenu(false); }} />
                <MenuItem icon={Flag} label="Report" onClick={() => { onReport?.(); setMenu(false); }} danger />
                {isOwner && <MenuItem icon={Edit} label="Edit" onClick={() => { onEdit?.(); setMenu(false); }} />}
                {isOwner && <MenuItem icon={Trash2} label="Delete" onClick={() => { onDelete?.(); setMenu(false); }} danger />}
              </div>
            </>
          )}
        </div>
      </div>

      {post.title && <div className="px-3"><h3 className="font-heading font-semibold text-base">{post.title}</h3></div>}

      {verified && (
        <div className="mx-3 mt-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-600">🏆 VERIFIED WIN</p>
            <p className="text-xs text-muted-foreground truncate">{contest.title} · ₹{(contest.prize_amount || 0).toLocaleString('en-IN')} prize</p>
          </div>
        </div>
      )}

      {hasMedia && (
        <button onClick={onOpen} className="block w-full text-left">
          <div className="relative aspect-video bg-secondary overflow-hidden mt-2">
            <img src={post.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            {post.type === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center"><Play className="w-6 h-6 text-white fill-white ml-0.5" /></div>
              </div>
            )}
          </div>
        </button>
      )}

      <button onClick={onOpen} className="block w-full text-left">
        <div className="px-3 pt-3 pb-2">
          {(post.body || post.caption) && <p className="text-sm leading-relaxed line-clamp-4 whitespace-pre-line">{post.body || post.caption}</p>}
          {post.hashtags && <p className="text-sm text-primary mt-1.5">{post.hashtags}</p>}
        </div>
      </button>

      <div className="flex items-center gap-4 px-3 py-2 border-t border-border">
        <button onClick={onLike} className="flex items-center gap-1.5">
          <Heart className={`w-5 h-5 transition ${liked ? 'fill-destructive text-destructive scale-110' : 'text-muted-foreground'}`} />
          <span className="text-sm text-muted-foreground">{formatCount(likeCount)}</span>
        </button>
        <button onClick={onOpen} className="flex items-center gap-1.5">
          <MessageCircle className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{formatCount(commentCount)}</span>
        </button>
        <button onClick={onShare} className="flex items-center gap-1.5"><Share2 className="w-5 h-5 text-muted-foreground" /></button>
        <button onClick={onSave} className="ml-auto"><Bookmark className={`w-5 h-5 transition ${saved ? 'fill-primary text-primary' : 'text-muted-foreground'}`} /></button>
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary text-left ${danger ? 'text-destructive' : ''}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}