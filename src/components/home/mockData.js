const now = Date.now();
const hoursFromNow = (h) => new Date(now + h * 3600000).toISOString();
const daysFromNow = (d) => new Date(now + d * 86400000).toISOString();

export const careerProfile = {
  level: 18,
  rank: "Bronze III",
  careerScore: 8450,
  currentXP: 2450,
  nextLevelXP: 3000,
  nextUnlock: { label: "₹10,000 Contest Access", unlockLevel: 20 },
};

export const dailyMissions = [
  { id: 1, title: "Complete 1 Contest", progress: 0, total: 1, xpReward: 150 },
  { id: 2, title: "Submit 2 Entries", progress: 1, total: 2, xpReward: 100 },
  { id: 3, title: "Earn 500 XP", progress: 320, total: 500, xpReward: 200 },
  { id: 4, title: "Maintain 5-Star Rating", progress: 4.8, total: 5, xpReward: 120 },
];

export const unlocks = [
  { level: 10, label: "₹5K Contests", sub: "Higher prize pools", unlocked: true },
  { level: 20, label: "₹10K Contests", sub: "Premium contest tier", unlocked: false },
  { level: 30, label: "Premium Brands", sub: "Exclusive brand projects", unlocked: false },
  { level: 50, label: "Verified Creator", sub: "Platform verification badge", unlocked: false },
];

export const achievements = [
  { id: 1, title: "First Win", desc: "Win your first contest", icon: "Crown", unlocked: true, date: "Jan 2026" },
  { id: 2, title: "Top 10", desc: "Reach top 10 leaderboard", icon: "TrendingUp", unlocked: true, date: "Feb 2026" },
  { id: 3, title: "Fast Delivery", desc: "Deliver within 6 hours", icon: "Zap", unlocked: true, date: "Mar 2026" },
  { id: 4, title: "Perfect Rating", desc: "Get a 5.0 star rating", icon: "Star", unlocked: true, date: "Apr 2026" },
  { id: 5, title: "100 Submissions", desc: "Submit 100 entries", icon: "FileCheck", unlocked: false, progress: 47, total: 100 },
  { id: 6, title: "Creative Master", desc: "Win 10 contests", icon: "Palette", unlocked: false, progress: 7, total: 10 },
];

export const weeklyRanking = {
  percentile: 10,
  countryRank: 89,
  globalRank: 1247,
};

export const events = [
  { id: 1, title: "Weekend Challenge", desc: "Double XP on all submissions", deadline: hoursFromNow(48), badge: "2x XP" },
  { id: 2, title: "Monthly Championship", desc: "Compete for ₹50,000 prize pool", deadline: daysFromNow(12), badge: "₹50K" },
  { id: 3, title: "Creator League S2", desc: "Season 2 qualifier matches", deadline: daysFromNow(5), badge: "S2" },
  { id: 4, title: "XP Boost Event", desc: "Triple XP for 24 hours", deadline: hoursFromNow(6), badge: "3x XP" },
];

export const recentActivity = [
  { id: 1, type: "xp", text: "Earned 150 XP from contest entry", time: "2h ago", value: "+150 XP" },
  { id: 2, type: "win", text: "Won 'Brand Promo Reel' contest", time: "5h ago", value: "+₹5,000" },
  { id: 3, type: "review", text: "Received 5-star review from brand", time: "1d ago", value: "★★★★★" },
  { id: 4, type: "level", text: "Leveled up to Level 18", time: "2d ago", value: "Bronze III" },
  { id: 5, type: "achievement", text: "Unlocked 'Fast Delivery' achievement", time: "3d ago", value: "+200 XP" },
  { id: 6, type: "submission", text: "Submitted entry for 'Travel Vlog Edit'", time: "4d ago", value: "Pending" },
];

export const statistics = [
  { label: "Total Wins", value: "12", icon: "Trophy" },
  { label: "Participation", value: "47", icon: "Users" },
  { label: "Win Rate", value: "25.5%", icon: "Target" },
  { label: "Avg Rating", value: "4.8", icon: "Star" },
  { label: "Career Score", value: "8,450", icon: "Activity" },
  { label: "Total Earnings", value: "₹84.5K", icon: "IndianRupee" },
];