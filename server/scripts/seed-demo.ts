// Seeds clearly-marked, removable demo data so every page is populated.
//   npx tsx scripts/seed-demo.ts          → create demo data
//   npx tsx scripts/seed-demo.ts --clean  → remove ALL demo data
// Everything created here carries data.demo === true (and demo users use
// @razekit.demo emails), so cleanup is exact and never touches real data.
import { prisma } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';
import { hashPassword } from '../src/auth/password.js';

const svc = serviceClient();
const clean = process.argv.includes('--clean');
const img = (seed: string) => `https://picsum.photos/seed/${seed}/1200/800`;

const DEMO_ENTITIES = ['Contest', 'Submission', 'Post', 'Review', 'UserProfile', 'Wallet'];

async function removeAll() {
  for (const name of DEMO_ENTITIES) {
    const rows = await svc.entities[name].filter({ demo: true }, '-created_date', 500).catch(() => []);
    for (const r of rows) await svc.entities[name].delete(r.id).catch(() => {});
    console.log(`removed ${rows.length} ${name}`);
  }
  const users = await prisma.appUser.findMany({ where: { email: { endsWith: '@razekit.demo' } } });
  for (const u of users) await prisma.appUser.delete({ where: { id: u.id } }).catch(() => {});
  console.log(`removed ${users.length} demo users`);
}

async function upsertUser(email: string, fullName: string, userRole: string, password: string) {
  const existing = await prisma.appUser.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.appUser.create({ data: { email, passwordHash: await hashPassword(password), fullName, userRole, role: 'user', emailVerified: true, onboardingCompleted: true } });
}

async function seed() {
  const brand = await upsertUser('demo.brand@razekit.demo', 'Nova Studios (Demo)', 'client', 'DemoBrand!2026');
  const creator = await upsertUser('demo.creator@razekit.demo', 'Aria Fields (Demo)', 'creator', 'DemoCreator!2026');
  console.log('demo brand:', brand.email, '/ DemoBrand!2026');
  console.log('demo creator:', creator.email, '/ DemoCreator!2026');

  await svc.entities.UserProfile.create({
    demo: true, user_id: creator.id, username: 'aria_demo', display_name: 'Aria Fields',
    bio: 'Short-form video editor & motion designer. Cinematic reels, punchy cuts, brand storytelling.',
    professional_title: 'Video Editor · Motion', skills: ['After Effects', 'Premiere Pro', 'CapCut', 'Color', 'Sound design'],
    avatar_url: img('aria-avatar'), profile_visibility: 'public',
  });

  const now = Date.now();
  const day = 86400000;
  const OPEN = [
    { title: 'Launch reel for a fintech app', category: 'Advertisement', prize_amount: 40000, days: 5, sd: 'A 30s hype reel for our app launch — fast, confident, modern.' },
    { title: '30s Instagram Reel — skincare drop', category: 'Instagram Reel', prize_amount: 18000, days: 2, sd: 'Glowy, aspirational reel for a new serum.' },
    { title: 'YouTube Shorts — gaming montage', category: 'Gaming', prize_amount: 25000, days: 3, sd: 'High-energy montage, synced cuts, big moments.' },
    { title: 'Wedding teaser edit', category: 'Wedding', prize_amount: 30000, days: 6, sd: 'Emotional 60s teaser from raw footage.' },
    { title: 'Corporate explainer (60s)', category: 'Corporate', prize_amount: 50000, days: 7, sd: 'Clean explainer with kinetic text and calm pacing.' },
  ];
  const contests: any[] = [];
  for (const [i, c] of OPEN.entries()) {
    const rec = await svc.entities.Contest.create({
      demo: true, created_by_id: brand.id, title: c.title, short_description: c.sd, category: c.category,
      description: `${c.sd}\n\nDeliver a polished cut ready for ${c.category}. Reference brand tone, keep it punchy, and include captions.`,
      prize_amount: c.prize_amount, number_of_winners: 1, currency: 'INR', settlement_region: 'IN', status: 'open',
      cover_image_url: img(`contest-${i}`), deadline: new Date(now + c.days * day).toISOString(),
    });
    contests.push(rec);
  }

  // An International (USD) contest so PayPal funding is testable out of the box.
  const usd = await svc.entities.Contest.create({
    demo: true, created_by_id: brand.id, title: 'Global product ad — 15s (USD)', category: 'Advertisement',
    short_description: 'A snappy 15s product ad for an international launch.',
    description: 'Punchy 15s product ad — upbeat pacing, English captions, ready for paid social.',
    prize_amount: 300, number_of_winners: 1, currency: 'USD', settlement_region: 'GLOBAL', status: 'open',
    cover_image_url: img('contest-usd'), deadline: new Date(now + 5 * day).toISOString(),
  });
  contests.push(usd);

  // A completed contest won by the demo creator (for Winners / Leaderboard / Profile).
  const completed = await svc.entities.Contest.create({
    demo: true, created_by_id: brand.id, title: 'Travel vlog cutdown — Bali series', category: 'Travel', short_description: 'A 45s cutdown from a week of travel footage.',
    description: 'Cinematic travel cutdown with rhythm and color.', prize_amount: 22000, number_of_winners: 1, currency: 'INR', settlement_region: 'IN',
    status: 'completed', cover_image_url: img('winner-bali'), winner_user_id: creator.id,
    deadline: new Date(now - 3 * day).toISOString(), winner_selected_at: new Date(now - 2 * day).toISOString(), completed_at: new Date(now - day).toISOString(),
  });
  const wonSub = await svc.entities.Submission.create({ demo: true, contest_id: completed.id, client_id: brand.id, created_by_id: creator.id, status: 'won', title: 'Bali cutdown — final', platform: 'YouTube', submitted_at: new Date(now - 2.5 * day).toISOString() });
  await svc.entities.Contest.update(completed.id, { winner_submission_id: wonSub.id });
  contests.push(completed);

  // A couple of live submissions on the first open contest.
  await svc.entities.Submission.create({ demo: true, contest_id: contests[0].id, client_id: brand.id, created_by_id: creator.id, status: 'submitted', title: 'Fintech reel v1', platform: 'Instagram', submitted_at: new Date().toISOString() });

  // Reviews (verified, for the profile + reputation).
  await svc.entities.Review.create({ demo: true, creator_id: creator.id, client_id: brand.id, contest_id: completed.id, reviewer_role: 'client', overall_rating: 5, review_text: 'Incredible turnaround and pacing — exactly the vibe we wanted. Will hire again.', verified: true, status: 'published' });

  // Feed posts.
  for (const [i, cap] of [
    'Winning travel cutdown for @novastudios — color + rhythm test 🌴',
    'Behind the cut: how I match beats to jump-cuts',
    'New reel drop — skincare mood board come to life',
  ].entries()) {
    await svc.entities.Post.create({ demo: true, author_id: creator.id, author_name: 'Aria Fields', author_username: 'aria_demo', author_avatar: img('aria-avatar'), media_url: img(`post-${i}`), caption: cap, type: 'showcase', post_type: 'showcase', status: 'published', moderation_status: 'visible', likes_count: 12 + i * 7, comments_count: i * 2, saves_count: i });
  }

  // Wallets so the Wallet page is populated.
  await svc.entities.Wallet.create({ demo: true, user_id: creator.id, currency: 'INR', available_balance: 22000, pending_balance: 0, reserved_funds: 0, total_deposits: 0, lifetime_earnings: 22000 });
  await svc.entities.Wallet.create({ demo: true, user_id: brand.id, currency: 'INR', available_balance: 0, pending_balance: 0, reserved_funds: 40000, total_deposits: 62000, lifetime_earnings: 0 });

  console.log(`\nSeeded ${contests.length} contests (+submissions, reviews, posts, wallets). All marked demo:true.`);
}

(clean ? removeAll() : seed()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
