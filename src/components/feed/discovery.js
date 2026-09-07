import { MOCK_CREATORS } from './feedData';

const getCreator = (username) => MOCK_CREATORS.find(c => c.username === username);

/**
 * Calculate quality score using multiple signals.
 * High Priority: contest winners, like/comment/share/save rates, creator level, career score, avg rating
 * Medium Priority: recency (first 24h/72h/7d boost)
 * Anti-spam: penalize very low engagement
 */
export function calculateQualityScore(post) {
  const creator = getCreator(post.author_username);
  const views = Math.max(post.views_count || 0, 1);
  const likes = post.likes_count || 0;
  const comments = post.comments_count || 0;
  const shares = post.shares_count || 0;
  const saves = post.saves_count || 0;

  const likeRate = likes / views;
  const commentRate = comments / views;
  const shareRate = shares / views;
  const saveRate = saves / views;

  const isContestWinner = post.category === 'Contest Winning Videos';
  const contestBonus = isContestWinner ? 2.0 : 1.0;

  const level = creator?.level || 1;
  const careerScore = creator?.score || 0;
  const avgRating = creator?.avgRating || 4.0;

  const ageHours = (Date.now() - new Date(post.created_date).getTime()) / 3600000;
  const recencyBonus = ageHours < 24 ? 1.5 : ageHours < 72 ? 1.2 : ageHours < 168 ? 1.05 : 1;

  const totalEngagement = likes + comments + shares + saves;
  const spamPenalty = totalEngagement < 5 ? 0.3 : totalEngagement < 20 ? 0.7 : 1;

  const engagementScore = likeRate * 3 + commentRate * 2 + shareRate * 2.5 + saveRate * 2;
  const creatorScore = (level / 10) * 0.5 + (careerScore / 10000) * 0.3 + (avgRating - 4) * 0.2;

  return (engagementScore + creatorScore) * contestBonus * recencyBonus * spamPenalty;
}

export function getCreatorTier(creator) {
  if (!creator) return 'new';
  if (creator.level >= 35) return 'high';
  if (creator.level >= 25) return 'rising';
  return 'new';
}

/**
 * Distribute posts: 40% high-performing, 25% rising, 20% new, 10% contest-winning, 5% random.
 * Prevents top creators from dominating. Role-based ordering for clients vs creators.
 */
export function distributeFeed(posts, userRole) {
  const scored = posts.map(p => {
    const creator = getCreator(p.author_username);
    return { ...p, _score: calculateQualityScore(p), _tier: getCreatorTier(creator) };
  });

  const high = scored.filter(p => p._tier === 'high').sort((a, b) => b._score - a._score);
  const rising = scored.filter(p => p._tier === 'rising').sort((a, b) => b._score - a._score);
  const newC = scored.filter(p => p._tier === 'new').sort((a, b) => b._score - a._score);
  const contest = scored.filter(p => p.category === 'Contest Winning Videos').sort((a, b) => b._score - a._score);

  const total = scored.length;
  const picked = new Set();
  const pick = (arr, count) => {
    const result = [];
    for (const p of arr) {
      if (result.length >= count) break;
      if (!picked.has(p.id)) { picked.add(p.id); result.push(p); }
    }
    return result;
  };

  const highPicks = pick(high, Math.ceil(total * 0.4));
  const risingPicks = pick(rising, Math.ceil(total * 0.25));
  const newPicks = pick(newC, Math.ceil(total * 0.2));
  const contestPicks = pick(contest, Math.ceil(total * 0.1));

  const remaining = scored.filter(p => !picked.has(p.id));
  const randomPicks = [...remaining].sort(() => Math.random() - 0.5).slice(0, Math.ceil(total * 0.05));
  const randomIds = new Set(randomPicks.map(p => p.id));
  const leftovers = remaining.filter(p => !randomIds.has(p.id)).sort((a, b) => b._score - a._score);

  if (userRole === 'client') {
    return [...contestPicks, ...highPicks, ...risingPicks, ...newPicks, ...randomPicks, ...leftovers];
  }
  return [...highPicks, ...risingPicks, ...contestPicks, ...newPicks, ...randomPicks, ...leftovers];
}