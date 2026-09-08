import { useState, useEffect } from 'react';
import { Plus, Film } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { MOCK_POSTS, DISCOVERY_FILTERS } from './feedData';
import { distributeFeed } from './discovery';
import PostCard from './PostCard';
import CommentsSheet from './CommentsSheet';
import CreatePostModal from './CreatePostModal';

const engagement = (p) => (p.likes_count || 0) + (p.comments_count || 0) * 2 + (p.shares_count || 0) * 3 + (p.views_count || 0) * 0.1;

export default function ShowcaseFeed({ onProfile }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Recommended');
  const [userRole, setUserRole] = useState('creator');
  const [commentPost, setCommentPost] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const [realPosts, me] = await Promise.all([
        base44.entities.Post.filter({ status: 'published' }, '-created_date', 50).catch(() => []),
        base44.auth.me().catch(() => null),
      ]);
      if (me?.user_role) setUserRole(me.user_role);
      setPosts([...realPosts, ...MOCK_POSTS]);
    } catch {
      setPosts(MOCK_POSTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, []);

  const getFilteredPosts = () => {
    let result = [...posts];

    if (filter === 'Contest Winners') {
      result = result.filter(p => p.category === 'Contest Winning Videos');
    }
    if (filter === 'Popular This Week') {
      const weekAgo = Date.now() - 7 * 86400000;
      result = result.filter(p => new Date(p.created_date).getTime() >= weekAgo);
    }

    if (filter === 'Recommended') {
      return distributeFeed(result, userRole);
    }

    return result.sort((a, b) => {
      switch (filter) {
        case 'Latest': return new Date(b.created_date) - new Date(a.created_date);
        case 'Most Liked': return (b.likes_count || 0) - (a.likes_count || 0);
        case 'Most Viewed': return (b.views_count || 0) - (a.views_count || 0);
        case 'Trending':
        case 'Popular This Week':
        case 'Contest Winners':
        default: return engagement(b) - engagement(a);
      }
    });
  };

  const filtered = getFilteredPosts();

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24 md:pb-8">
      {/* Discovery Filters */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
        {DISCOVERY_FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="h-80 bg-card border border-border rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map(p => (
            <PostCard key={p.id} post={p} onComment={setCommentPost} onProfile={onProfile} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Film className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No posts found</p>
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setShowCreate(true)}
        className="fixed bottom-20 md:bottom-6 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors glow-primary">
        <Plus className="w-6 h-6" />
      </button>

      {/* Modals */}
      <CommentsSheet post={commentPost} open={!!commentPost} onClose={() => setCommentPost(null)} />
      <CreatePostModal open={showCreate} onClose={() => setShowCreate(false)} onPublished={fetchPosts} />
    </div>
  );
}