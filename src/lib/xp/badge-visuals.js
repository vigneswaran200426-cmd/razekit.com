// Visual-only metadata for badges. This does NOT change unlock rules or award
// logic (those live in badges.js). It maps each badge id -> rarity + silhouette
// shape, plus display groups and a progress extractor for locked badges.

export const RARITY = {
  common: { id: 'common', label: 'Common', rank: 1, from: '#cbd5e1', to: '#94a3b8', glow: false, text: 'text-slate-500', ring: 'ring-slate-300' },
  rare: { id: 'rare', label: 'Rare', rank: 2, from: '#60a5fa', to: '#2563eb', glow: false, text: 'text-blue-600', ring: 'ring-blue-300' },
  epic: { id: 'epic', label: 'Epic', rank: 3, from: '#c084fc', to: '#7c3aed', glow: true, text: 'text-purple-600', ring: 'ring-purple-300' },
  legendary: { id: 'legendary', label: 'Legendary', rank: 4, from: '#fcd34d', to: '#d97706', glow: true, text: 'text-amber-600', ring: 'ring-amber-300' },
  mythic: { id: 'mythic', label: 'Mythic', rank: 5, from: '#f0abfc', via: '#a855f7', to: '#f59e0b', glow: true, text: 'text-fuchsia-600', ring: 'ring-fuchsia-300' },
};

export const RARITY_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'common'];

export const BADGE_VISUALS = {
  first_win: { rarity: 'common', shape: 'medal' },
  first_submit: { rarity: 'common', shape: 'medal' },
  early_bird: { rarity: 'common', shape: 'target' },
  five_wins: { rarity: 'rare', shape: 'crest' },
  clean_record: { rarity: 'rare', shape: 'shield' },
  rising_star: { rarity: 'rare', shape: 'star' },
  ten_wins: { rarity: 'epic', shape: 'trophy' },
  prolific: { rarity: 'epic', shape: 'shield' },
  verified: { rarity: 'epic', shape: 'shield' },
  streak_master: { rarity: 'epic', shape: 'flame' },
  trusted: { rarity: 'epic', shape: 'shield' },
  hundred_subs: { rarity: 'legendary', shape: 'banner' },
  five_star: { rarity: 'legendary', shape: 'star' },
  elite: { rarity: 'legendary', shape: 'crown' },
  quality_king: { rarity: 'legendary', shape: 'gem' },
  legend: { rarity: 'mythic', shape: 'crown' },
};

export const BADGE_GROUPS = [
  { id: 'starter', label: 'Starter', badgeIds: ['first_submit', 'first_win'] },
  { id: 'performance', label: 'Performance', badgeIds: ['ten_wins', 'prolific', 'hundred_subs', 'rising_star', 'elite', 'legend'] },
  { id: 'quality', label: 'Quality', badgeIds: ['five_star', 'quality_king'] },
  { id: 'speed', label: 'Speed', badgeIds: ['early_bird', 'fast_delivery'] },
  { id: 'consistency', label: 'Consistency', badgeIds: ['streak_master'] },
  { id: 'trust', label: 'Trust', badgeIds: ['verified', 'trusted', 'clean_record'] },
  { id: 'specialization', label: 'Specialization', badgeIds: ['five_wins'], showIf: (s) => (s?.contests_won || 0) >= 1 },
];

// Numeric progress for locked badges. Returns {current, target} or null for
// compound conditions (those show the requirement text only).
export const BADGE_PROGRESS = {
  first_win: (s) => ({ current: s.contests_won || 0, target: 1 }),
  ten_wins: (s) => ({ current: s.contests_won || 0, target: 10 }),
  five_wins: (s) => ({ current: s.contests_won || 0, target: 5 }),
  hundred_subs: (s) => ({ current: s.contests_submitted || 0, target: 100 }),
  prolific: (s) => ({ current: s.contests_submitted || 0, target: 50 }),
  first_submit: (s) => ({ current: s.contests_submitted || 0, target: 1 }),
  rising_star: (s) => ({ current: s.level || 1, target: 10 }),
  verified: (s) => ({ current: s.level || 1, target: 20 }),
  elite: (s) => ({ current: s.level || 1, target: 40 }),
  legend: (s) => ({ current: s.level || 1, target: 50 }),
  fast_delivery: (s) => ({ current: s.on_time_count || 0, target: 10 }),
  early_bird: (s) => ({ current: s.on_time_count || 0, target: 5 }),
  trusted: (s) => ({ current: s.reputation_score || 0, target: 75 }),
  streak_master: (s) => ({ current: s.best_streak || 0, target: 10 }),
};

export function getProgress(badgeId, stats) {
  const fn = BADGE_PROGRESS[badgeId];
  if (!fn || !stats) return null;
  try { return fn(stats); } catch { return null; }
}