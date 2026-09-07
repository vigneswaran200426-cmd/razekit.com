const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();
const daysAgo = (d) => new Date(now - d * 86400000).toISOString();

export const MOCK_CREATORS = [
  { id: 'c1', name: 'Arjun K.', username: 'arjun_k', level: 47, score: 24500, wins: 34, reviews: 4.9, memberSince: 'Jan 2024', followers: 12400, following: 234, bio: 'Award-winning video editor. Brand promos, motion graphics, cinematic storytelling.', verified: true, winStreak: 7, avgRating: 4.9, banner: 'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=800&q=80' },
  { id: 'c2', name: 'Sara M.', username: 'sara_motion', level: 42, score: 21800, wins: 28, reviews: 4.8, memberSince: 'Mar 2024', followers: 9800, following: 156, bio: 'Motion graphics designer & visual storyteller. After Effects wizard.', verified: true, winStreak: 4, avgRating: 4.8, banner: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800&q=80' },
  { id: 'c3', name: 'Rahul P.', username: 'rahul_fx', level: 39, score: 19200, wins: 22, reviews: 4.7, memberSince: 'Feb 2024', followers: 7600, following: 89, bio: 'VFX artist & compositing specialist. Creating magic frame by frame.', verified: false, winStreak: 3, avgRating: 4.7, banner: 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=800&q=80' },
  { id: 'c4', name: 'Priya S.', username: 'priya_edits', level: 35, score: 17500, wins: 19, reviews: 4.9, memberSince: 'Apr 2024', followers: 6200, following: 201, bio: 'Color grading enthusiast. DaVinci Resolve power user.', verified: false, winStreak: 5, avgRating: 4.9, banner: 'https://images.unsplash.com/photo-1626379953822-baec19c3accd?w=800&q=80' },
  { id: 'c5', name: 'Karthik R.', username: 'karthik_r', level: 31, score: 15800, wins: 16, reviews: 4.6, memberSince: 'May 2024', followers: 4800, following: 312, bio: 'Reels & short-form video expert. Fast turnaround, high impact.', verified: false, winStreak: 2, avgRating: 4.6, banner: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=800&q=80' },
  { id: 'c6', name: 'Nisha V.', username: 'nisha_v', level: 29, score: 14200, wins: 14, reviews: 4.8, memberSince: 'Jun 2024', followers: 3900, following: 178, bio: 'Editing tips creator. Teaching the next gen of editors.', verified: false, winStreak: 1, avgRating: 4.8, banner: 'https://images.unsplash.com/photo-1598899134739-24c91f9c2f15?w=800&q=80' },
  { id: 'c7', name: 'Vikram J.', username: 'vikram_j', level: 27, score: 12500, wins: 12, reviews: 4.5, memberSince: 'Jul 2024', followers: 3100, following: 245, bio: 'Project breakdowns & behind-the-scenes content.', verified: false, winStreak: 0, avgRating: 4.5, banner: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80' },
  { id: 'c8', name: 'Anita D.', username: 'anita_d', level: 25, score: 10800, wins: 10, reviews: 4.7, memberSince: 'Aug 2024', followers: 2400, following: 167, bio: 'Before & after transformation specialist. Wedding & event edits.', verified: false, winStreak: 3, avgRating: 4.7, banner: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80' },
  { id: 'c9', name: 'Rohan G.', username: 'rohan_g', level: 23, score: 9200, wins: 8, reviews: 4.4, memberSince: 'Sep 2024', followers: 1800, following: 134, bio: 'Rising editor. Focused on gaming content & highlights.', verified: false, winStreak: 1, avgRating: 4.4, banner: 'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=800&q=80' },
  { id: 'c10', name: 'Deepa N.', username: 'deepa_n', level: 22, score: 8800, wins: 7, reviews: 4.6, memberSince: 'Oct 2024', followers: 1500, following: 98, bio: 'Travel & documentary editor. Stories that move people.', verified: false, winStreak: 0, avgRating: 4.6, banner: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800&q=80' },
];

const img = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80`;

export const MOCK_POSTS = [
  { id: 'mock-1', author_id: 'c1', author_name: 'Arjun K.', author_username: 'arjun_k', author_level: 47, author_verified: true, type: 'image', media_url: img('1492619375914-88005aa9e8fb'), caption: 'Brand promo reel I edited for a tech startup. Used dynamic transitions and cinematic color grading to match their bold identity. What do you think?', hashtags: '#brandpromo #colorgrading #premierepro', category: 'Contest Winning Videos', software: 'Premiere Pro', editing_style: 'Cinematic', likes_count: 1240, comments_count: 89, shares_count: 45, views_count: 8400, saves_count: 230, status: 'published', created_date: hoursAgo(3) },
  { id: 'mock-2', author_id: 'c2', author_name: 'Sara M.', author_username: 'sara_motion', author_level: 42, author_verified: true, type: 'video', media_url: img('1574717024653-61fd2cf4d44d'), caption: 'Motion graphics breakdown! Showing my full process from sketch to final render. Key takeaway: always start with storyboards!', hashtags: '#motiongraphics #aftereffects #tutorial', category: 'Project Breakdowns', software: 'After Effects', editing_style: 'Motion Graphics', likes_count: 890, comments_count: 56, shares_count: 78, views_count: 5200, saves_count: 410, status: 'published', created_date: hoursAgo(8) },
  { id: 'mock-3', author_id: 'c3', author_name: 'Rahul P.', author_username: 'rahul_fx', author_level: 39, author_verified: false, type: 'image', media_url: img('1535016120720-40c646be5580'), caption: 'VFX compositing shot — green screen removal and background replacement. Took 3 hours but the result is seamless!', hashtags: '#vfx #compositing #greenscreen', category: 'VFX', software: 'After Effects', editing_style: 'Compositing', likes_count: 670, comments_count: 34, shares_count: 22, views_count: 3100, saves_count: 145, status: 'published', created_date: hoursAgo(14) },
  { id: 'mock-4', author_id: 'c4', author_name: 'Priya S.', author_username: 'priya_edits', author_level: 35, author_verified: false, type: 'image', media_url: img('1626379953822-baec19c3accd'), caption: 'Before & After color grading! Swipe to see the transformation. Used DaVinci Resolve with custom LUTs.', hashtags: '#colorgrading #beforeafter #davinciresolve', category: 'Before & After', software: 'DaVinci Resolve', editing_style: 'Color Grading', likes_count: 1450, comments_count: 102, shares_count: 67, views_count: 9800, saves_count: 520, status: 'published', created_date: hoursAgo(20) },
  { id: 'mock-5', author_id: 'c5', author_name: 'Karthik R.', author_username: 'karthik_r', author_level: 31, author_verified: false, type: 'video', media_url: img('1598653222000-6b7b7a552625'), caption: 'Quick reel edit for a fashion brand! Turned this around in 2 hours. Fast cuts + trending audio = engagement!', hashtags: '#reels #fashionedit #capcut', category: 'Reels', software: 'CapCut', editing_style: 'Fast-paced', likes_count: 2100, comments_count: 156, shares_count: 134, views_count: 15400, saves_count: 680, status: 'published', created_date: daysAgo(1) },
  { id: 'mock-6', author_id: 'c6', author_name: 'Nisha V.', author_username: 'nisha_v', author_level: 29, author_verified: false, type: 'image', media_url: img('1598899134739-24c91f9c2f15'), caption: 'Editing tip: Use J-cuts and L-cuts to make your conversations feel natural. Here\'s a visual guide I made for beginners!', hashtags: '#editingtips #jcuts #tutorial', category: 'Editing Tutorials', software: 'Premiere Pro', editing_style: 'Educational', likes_count: 560, comments_count: 78, shares_count: 45, views_count: 4200, saves_count: 890, status: 'published', created_date: daysAgo(2) },
  { id: 'mock-7', author_id: 'c7', author_name: 'Vikram J.', author_username: 'vikram_j', author_level: 27, author_verified: false, type: 'image', media_url: img('1505740420928-5e560c06d30e'), caption: 'Full project breakdown of my latest wedding film. From raw footage to final delivery — every decision explained.', hashtags: '#projectbreakdown #weddingfilm #storytelling', category: 'Project Breakdowns', software: 'Final Cut Pro', editing_style: 'Documentary', likes_count: 430, comments_count: 28, shares_count: 15, views_count: 2100, saves_count: 190, status: 'published', created_date: daysAgo(3) },
  { id: 'mock-8', author_id: 'c8', author_name: 'Anita D.', author_username: 'anita_d', author_level: 25, author_verified: false, type: 'image', media_url: img('1518770660439-4636190af475'), caption: 'Before & After: Event highlight reel transformation. Added motion blur, speed ramps, and synced transitions to the beat.', hashtags: '#beforeafter #eventedit #speedramps', category: 'Before & After', software: 'Premiere Pro', editing_style: 'Energetic', likes_count: 380, comments_count: 19, shares_count: 8, views_count: 1800, saves_count: 76, status: 'published', created_date: daysAgo(4) },
];

export const DISCOVERY_FILTERS = ['Recommended', 'Trending', 'Latest', 'Most Viewed', 'Most Liked', 'Contest Winners', 'Popular This Week'];
export const POST_CATEGORIES = ['Edited Videos', 'Motion Graphics', 'VFX', 'Color Grading', 'Before & After', 'Reels', 'Animation', 'Editing Tutorials', 'Contest Winning Videos', 'Project Breakdowns'];

export function timeAgo(dateStr) {
  if (!dateStr) return 'just now';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

export function formatCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return (n || 0).toString();
}

export function getCreatorByUsername(username) {
  return MOCK_CREATORS.find(c => c.username === username);
}