import { useState } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, BadgeCheck, Play, Eye, MoreHorizontal, Pin, Copy, Archive, Flag, Edit, Trash2 } from 'lucide-react';
import { timeAgo, formatCount, getCreatorByUsername } from './feedData';
import { toast } from '@/components/ui/use-toast';
import ShareSheet from './ShareSheet';

export default function PostCard({ post, onComment, onProfile }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const handleProfile = () => {
    const creator = getCreatorByUsername(post.author_username);
    onProfile?.(creator || { name: post.author_name, username: post.author_username, level: post.author_level, verified: post.author_verified });
  };

  const menuItems = [
    { icon: Pin, label: 'Pin Post', action: () => toast({ title: 'Post pinned to profile' }) },
    { icon: Copy, label: 'Copy Link', action: () => { navigator.clipboard?.writeText(`${window.location.origin}/winners-hub`); toast({ title: 'Link copied' }); } },
    { icon: Share2, label: 'Share to...', action: () => setShowShare(true) },
    { icon: Archive, label: 'Archive', action: () => toast({ title: 'Post archived' }) },
    { icon: MessageCircle, label: 'Turn Off Comments', action: () => toast({ title: 'Comments turned off' }) },
  ];
  const dangerItems = [
    { icon: Edit, label: 'Edit Post', action: () => toast({ title: 'Edit coming soon' }) },
    { icon: Trash2, label: 'Delete Post', action: () => toast({ title: 'Delete coming soon', variant: 'destructive' }) },
    { icon: Flag, label: 'Report', action: () => toast({ title: 'Report submitted', description: 'Spam, Copyright, Harassment, AI Spam, Duplicate Content' }) },
  ];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Author Header */}
      <div className="flex items-center gap-3 p-3">
        <button onClick={handleProfile} className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
          <span className="font-heading text-sm font-bold text-primary">{post.author_name?.[0]}</span>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <button onClick={handleProfile} className="font-medium text-sm truncate hover:underline">{post.author_name}</button>
            {post.author_verified && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="text-primary">@{post.author_username}</span>
            <span>·</span>
            <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px]">Lv {post.author_level}</span>
            <span>·</span>
            <span>{timeAgo(post.created_date)}</span>
          </div>
        </div>
        <div className="relative shrink-0">
          <button onClick={() => setShowMenu(!showMenu)} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center">
            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl w-48 z-30 py-1">
                {menuItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} onClick={() => { item.action(); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary text-left">
                      <Icon className="w-4 h-4 text-muted-foreground" /> {item.label}
                    </button>
                  );
                })}
                <div className="border-t border-border my-1" />
                {dangerItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} onClick={() => { item.action(); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary text-left text-destructive">
                      <Icon className="w-4 h-4" /> {item.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Media */}
      <div className="relative aspect-video bg-secondary overflow-hidden">
        <img src={post.media_url} alt={post.caption} className="w-full h-full object-cover" loading="lazy"
          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
        <div className="absolute inset-0 hidden items-center justify-center bg-gradient-to-br from-primary/20 to-secondary">
          <Play className="w-12 h-12 text-primary/50" />
        </div>
        {post.type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            </div>
          </div>
        )}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {post.views_count > 0 && (
            <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm flex items-center gap-1">
              <Eye className="w-3 h-3" /> {formatCount(post.views_count)}
            </span>
          )}
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm">{post.category}</span>
        </div>
      </div>

      {/* Interactions */}
      <div className="flex items-center gap-4 px-3 py-2.5">
        <button onClick={() => setLiked(!liked)} className="flex items-center gap-1.5">
          <Heart className={`w-5 h-5 transition-all ${liked ? 'fill-destructive text-destructive scale-110' : 'text-muted-foreground'}`} />
          <span className="text-sm text-muted-foreground">{formatCount(post.likes_count + (liked ? 1 : 0))}</span>
        </button>
        <button onClick={() => onComment?.(post)} className="flex items-center gap-1.5">
          <MessageCircle className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{formatCount(post.comments_count)}</span>
        </button>
        <button onClick={() => setShowShare(true)} className="flex items-center gap-1.5">
          <Share2 className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{formatCount(post.shares_count)}</span>
        </button>
        <button onClick={() => setSaved(!saved)} className="ml-auto">
          <Bookmark className={`w-5 h-5 transition-all ${saved ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
        </button>
      </div>

      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-sm leading-relaxed line-clamp-3">{post.caption}</p>
        {post.hashtags && <p className="text-sm text-primary mt-1.5">{post.hashtags}</p>}
        {(post.software || post.editing_style) && (
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            {post.software && <span className="px-2 py-0.5 rounded bg-secondary">🖥️ {post.software}</span>}
            {post.editing_style && <span className="px-2 py-0.5 rounded bg-secondary">🎨 {post.editing_style}</span>}
          </div>
        )}
      </div>

      <ShareSheet open={showShare} onClose={() => setShowShare(false)} title={post.caption} />
    </div>
  );
}