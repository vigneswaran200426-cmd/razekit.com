// One-month RazeKit simulation (spec 23/24).
//
//   npx tsx scripts/seed-simulation.ts          → create
//   npx tsx scripts/seed-simulation.ts --clean  → remove the whole batch
//   npx tsx scripts/seed-simulation.ts --small  → 50 creators / 10 brands
//
// SAFETY
//  • Every row carries seed_batch = SEED_BATCH and demo = true, so cleanup is
//    exact and can never touch real production data.
//  • Accounts use @razekit.sim (simulation) and @razekit.test (QA) so they are
//    excluded from public trust metrics, real payouts and real email audiences.
//  • Cleanup deletes ONLY tagged rows. There is no truncate, drop or reset.
//  • Uses the REAL duration rules and the REAL scoring engine — no invented
//    numbers, so Tracker/Winners/leaderboard show mathematically valid results.
import 'dotenv/config';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { allowedDuration } from '../src/contest/duration.js';
import { videoEngagementScore, brandTrafficScore, finalScore, rankSubmissions, SCORING_VERSION } from '../src/scoring/index.js';

const SEED_BATCH = 'sim-2026-09';
const SIM_DOMAIN = '@razekit.sim';
const QA_DOMAIN = '@razekit.test';

const clean = process.argv.includes('--clean');
const small = process.argv.includes('--small');

const N_CREATORS = small ? 50 : 500;
const N_BRANDS = small ? 10 : 100;

const DAY = 86400000;
const NOW = Date.now();
const MONTH_AGO = NOW - 30 * DAY;

// Deterministic PRNG so reruns produce a comparable dataset.
let _s = 1337;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const CATEGORIES = ['Instagram Reel', 'YouTube Shorts', 'YouTube Video', 'Advertisement', 'Gaming', 'Wedding', 'Documentary', 'Corporate', 'Travel', 'Music Video'];
const BRAND_WORDS = ['Nova', 'Astra', 'Vertex', 'Lumen', 'Orbit', 'Pulse', 'Quanta', 'Zenith', 'Aster', 'Kite', 'Vela', 'Ember', 'Onyx', 'Ridge', 'Halo'];
const BRAND_SUFFIX = ['Studios', 'Labs', 'Collective', 'Works', 'Brands', 'Co', 'Group', 'Media'];
const FIRST = ['Aria', 'Kabir', 'Meera', 'Dev', 'Riya', 'Arjun', 'Sana', 'Vikram', 'Isha', 'Rohan', 'Tara', 'Nikhil', 'Priya', 'Kunal', 'Anaya', 'Zoya', 'Aditya', 'Neha'];
const LAST = ['Fields', 'Rao', 'Sharma', 'Nair', 'Kapoor', 'Iyer', 'Bose', 'Menon', 'Shah', 'Verma', 'Gill', 'Reddy'];
// Prize points chosen to exercise every fairness tier, including boundaries.
const PRIZES = [5000, 12000, 20000, 20001, 35000, 50000, 50001, 75000, 100000, 100001, 200000, 300000];

const img = (s: string) => `https://picsum.photos/seed/${s}/1200/800`;

type Row = { entity: string; data: any; createdById: string | null; createdDate: Date };
const rows: Row[] = [];
const add = (entity: string, data: any, createdById: string | null = null, at: number = NOW) =>
  rows.push({ entity, data: { ...data, demo: true, seed_batch: SEED_BATCH }, createdById, createdDate: new Date(at) });

async function removeBatch() {
  console.log(`Removing seed batch "${SEED_BATCH}"…`);
  const users = await prisma.appUser.findMany({
    where: { OR: [{ email: { endsWith: SIM_DOMAIN } }, { email: { endsWith: QA_DOMAIN } }] },
    select: { id: true },
  });
  const ids = new Set(users.map((u) => u.id));

  // Delete ONLY rows tagged with this batch (or owned by a seed identity).
  const all = await prisma.record.findMany({ select: { id: true, data: true, createdById: true } });
  const doomed = all.filter((r) => {
    const d: any = r.data || {};
    return d.seed_batch === SEED_BATCH || ids.has(r.createdById || '');
  });
  for (let i = 0; i < doomed.length; i += 500) {
    await prisma.record.deleteMany({ where: { id: { in: doomed.slice(i, i + 500).map((r) => r.id) } } });
  }
  const del = await prisma.appUser.deleteMany({
    where: { OR: [{ email: { endsWith: SIM_DOMAIN } }, { email: { endsWith: QA_DOMAIN } }] },
  });
  console.log(`  removed ${doomed.length} records and ${del.count} seed accounts.`);
}

async function seed() {
  console.log(`Seeding batch "${SEED_BATCH}" — ${N_CREATORS} creators, ${N_BRANDS} brands…`);

  // One shared hash: hashing 600 passwords individually is slow and adds nothing.
  const simHash = await hashPassword('RzkSim!26-Seed');

  // ── QA accounts (spec 24) — exact credentials ───────────────────────────────
  const qa: { email: string; role: string; name: string; hash: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const n = String(i).padStart(2, '0');
    qa.push({ email: `creator.qa${n}${QA_DOMAIN}`, role: 'creator', name: `Creator QA ${n}`, hash: await hashPassword(`RzkQA!26-C${n}`) });
  }
  for (let i = 1; i <= 5; i++) {
    const n = String(i).padStart(2, '0');
    qa.push({ email: `brand.qa${n}${QA_DOMAIN}`, role: 'client', name: `Brand QA ${n}`, hash: await hashPassword(`RzkQA!26-B${n}`) });
  }

  const users: any[] = qa.map((q) => ({
    email: q.email, passwordHash: q.hash, fullName: q.name,
    userRole: q.role, role: 'user', emailVerified: true, onboardingCompleted: true,
  }));

  for (let i = 0; i < N_CREATORS; i++) {
    users.push({
      email: `creator${String(i + 1).padStart(3, '0')}${SIM_DOMAIN}`, passwordHash: simHash,
      fullName: `${pick(FIRST)} ${pick(LAST)}`, userRole: 'creator', role: 'user',
      emailVerified: true, onboardingCompleted: true,
    });
  }
  for (let i = 0; i < N_BRANDS; i++) {
    users.push({
      email: `brand${String(i + 1).padStart(3, '0')}${SIM_DOMAIN}`, passwordHash: simHash,
      fullName: `${pick(BRAND_WORDS)} ${pick(BRAND_SUFFIX)}`, userRole: 'client', role: 'user',
      emailVerified: true, onboardingCompleted: true,
    });
  }

  await prisma.appUser.createMany({ data: users, skipDuplicates: true });
  const created = await prisma.appUser.findMany({
    where: { OR: [{ email: { endsWith: SIM_DOMAIN } }, { email: { endsWith: QA_DOMAIN } }] },
    select: { id: true, email: true, fullName: true, userRole: true },
  });
  const creators = created.filter((u) => u.userRole === 'creator');
  const brands = created.filter((u) => u.userRole === 'client');
  console.log(`  accounts: ${creators.length} creators, ${brands.length} brands (incl. 15 QA)`);

  // ── Contests spread across the month, in every lifecycle state ──────────────
  let nContests = 0, nSubs = 0, nLinks = 0, nEvents = 0, nSnaps = 0, nWinners = 0, nNotes = 0, nTickets = 0;

  for (const brand of brands) {
    for (let c = 0; c < int(1, 3); c++) {
      const prize = pick(PRIZES);
      const win = allowedDuration(prize)!;
      const days = int(win.minDays, win.maxDays);           // always inside the real window
      const startedAt = MONTH_AGO + Math.floor(rnd() * 26 * DAY);
      const deadline = startedAt + days * DAY;
      const ended = deadline < NOW;

      // Mostly finished contests, plus cancelled/expired cases for realism.
      const roll = rnd();
      const status = !ended ? 'open' : roll < 0.12 ? 'cancelled' : roll < 0.22 ? 'open' : 'winner_selected';
      const category = pick(CATEGORIES);
      const contestId = crypto.randomUUID();

      add('Contest', {
        title: `${pick(['Launch', 'Brand', 'Story', 'Hero', 'Promo', 'Teaser'])} ${category} — ${brand.fullName}`,
        short_description: `A ${category.toLowerCase()} brief from ${brand.fullName}.`,
        description: 'Deliver a polished cut that matches the brand tone. Include captions.',
        category, prize_amount: prize, currency: 'INR', settlement_region: 'IN',
        number_of_winners: 1, status,
        cover_image_url: img(`c${nContests}`),
        start_date: new Date(startedAt).toISOString(),
        deadline: new Date(deadline).toISOString(),
        min_duration_days: win.minDays, max_duration_days: win.maxDays,
        duration_rule_version: win.ruleVersion,
        brand_destination_url: rnd() < 0.85 ? `https://example.com/${brand.fullName.toLowerCase().replace(/\W+/g, '-')}` : null,
        created_by_id: brand.id,
        _id: contestId,
      }, brand.id, startedAt);
      nContests++;

      // ── Participation ────────────────────────────────────────────────────────
      const entrants = [...creators].sort(() => rnd() - 0.5).slice(0, int(0, 9)); // includes zero-entry contests
      const entries: any[] = [];

      for (const cr of entrants) {
        const submittedAt = startedAt + Math.floor(rnd() * Math.max(1, deadline - startedAt));
        const subId = crypto.randomUUID();
        const disqualified = rnd() < 0.04;

        // Engagement + verified traffic. Some entries have neither, so
        // "insufficient data" and provisional states appear naturally.
        const hasEng = rnd() < 0.75;
        const hasTraffic = rnd() < 0.7;
        const metrics = hasEng ? {
          views: int(200, 60000), likes: int(10, 4000), comments: int(0, 400),
          shares: int(0, 900), saves: int(0, 700), watch_time: int(50, 30000),
          follower_growth: int(0, 500),
        } : null;
        const uniqueVisitors = hasTraffic ? int(0, 900) : 0;
        const totalClicks = hasTraffic ? uniqueVisitors + int(0, 120) : 0;
        const excluded = hasTraffic ? int(0, 40) : 0;

        entries.push({ id: subId, creator: cr, submittedAt, metrics, uniqueVisitors, disqualified });

        add('Submission', {
          contest_id: contestId, client_id: brand.id, created_by_id: cr.id,
          title: `${category} entry — ${cr.fullName}`,
          platform: pick(['Instagram', 'YouTube', 'TikTok']),
          media_kind: 'video', status: disqualified ? 'not_selected' : (ended ? 'submitted' : 'working'),
          submitted_at: new Date(submittedAt).toISOString(),
          live_url: `https://example.com/post/${subId.slice(0, 8)}`,
          url_status: 'published',
          _id: subId,
        }, cr.id, submittedAt);
        nSubs++;

        if (metrics) {
          add('SocialCampaignPost', {
            contest_id: contestId, creator_id: cr.id, client_id: brand.id, submission_id: subId,
            platform: 'Instagram', status: 'published', tracking_mode: 'auto',
            live_url: `https://example.com/post/${subId.slice(0, 8)}`,
            metrics: JSON.stringify(metrics),
            last_checked_at: new Date(Math.min(NOW, deadline)).toISOString(),
          }, null, submittedAt);
        }

        if (hasTraffic) {
          const code = Math.random().toString(36).slice(2, 14);
          add('TrackingLink', {
            code, contest_id: contestId, creator_id: cr.id, client_id: brand.id, submission_id: subId,
            destination_url: `https://example.com/${brand.fullName.toLowerCase().replace(/\W+/g, '-')}`,
            status: 'active', total_clicks: totalClicks, verified_clicks: uniqueVisitors,
            unique_visitors: uniqueVisitors, suspicious_clicks: excluded,
            last_click_at: new Date(Math.min(NOW, deadline)).toISOString(),
          }, null, submittedAt);
          nLinks++;

          // A sample of raw events (aggregates live on the link; we do not
          // materialise every click).
          for (let e = 0; e < Math.min(4, uniqueVisitors); e++) {
            add('TrafficEvent', {
              tracking_code: code, contest_id: contestId, creator_id: cr.id, client_id: brand.id,
              submission_id: subId,
              occurred_at: new Date(submittedAt + e * 3600_000).toISOString(),
              visitor_hash: `sim${subId.slice(0, 8)}${e}`, ua_hash: 'simua',
              verification_state: e === 3 && excluded > 0 ? 'suspicious' : 'verified',
              risk_reasons: e === 3 && excluded > 0 ? JSON.stringify(['visitor_burst']) : '[]',
              dedupe_key: `${code}:sim${e}`, is_unique: true,
            }, null, submittedAt + e * 3600_000);
            nEvents++;
          }
        }
      }

      // ── Scoring + winner, using the REAL engine ──────────────────────────────
      if (status === 'winner_selected' && entries.length) {
        const live = entries.filter((e) => !e.disqualified);
        if (live.length) {
          const popMax: any = {};
          for (const k of ['views', 'likes', 'comments', 'shares', 'saves', 'watch_time', 'follower_growth']) {
            popMax[k] = Math.max(0, ...live.map((e) => e.metrics?.[k] || 0));
          }
          const trafficMax = Math.max(0, ...live.map((e) => e.uniqueVisitors || 0));

          const scored = live.map((e) => {
            const eng = e.metrics ? videoEngagementScore(e.metrics, popMax) : null;
            const trf = trafficMax > 0 ? brandTrafficScore(e.uniqueVisitors, trafficMax) : null;
            const fin = eng === null && trf === null ? null : finalScore(eng ?? 0, trf ?? 0);
            return { ...e, engagement_score: eng, traffic_score: trf, final_score: fin,
                     score_state: eng === null || trf === null ? 'provisional' : 'final',
                     submitted_at: new Date(e.submittedAt).toISOString() };
          }).filter((e) => e.final_score !== null);

          if (scored.length) {
            const ranked = rankSubmissions(scored);
            const winner = ranked[0];
            const finalizedAt = deadline + DAY;

            ranked.forEach((e, i) => {
              add('ScoreSnapshot', {
                contest_id: contestId, submission_id: e.id, creator_id: e.creator.id, client_id: brand.id,
                engagement_score: e.engagement_score, traffic_score: e.traffic_score,
                final_score: e.final_score, rank: i + 1, is_winner: e.id === winner.id,
                tie_break_applied: ranked.some((o) => o.id !== e.id && o.final_score === e.final_score),
                scoring_version: SCORING_VERSION, score_state: e.score_state,
                metric_snapshot: JSON.stringify({ engagement: e.metrics, verified_unique_visitors: e.uniqueVisitors }),
                finalized_at: new Date(finalizedAt).toISOString(),
              }, null, finalizedAt);
              nSnaps++;
            });

            add('AuditLog', {
              user_id: winner.creator.id, action: 'winner.finalize', actor: brand.id, status: 'success',
              reason: 'scored',
              result: JSON.stringify({ contest_id: contestId, submission_id: winner.id, final_score: winner.final_score, scoring_version: SCORING_VERSION }),
            }, null, finalizedAt);

            add('WinnerPublish', {
              contest_id: contestId, submission_id: winner.id, creator_id: winner.creator.id, client_id: brand.id,
              placement: 1, title: `${category} winner — ${winner.creator.fullName}`,
              category, prize_amount: prize, currency: 'INR',
              media_url: img(`w${nWinners}`), thumbnail_url: img(`w${nWinners}`),
              status: 'published', published_at: new Date(finalizedAt).toISOString(),
              client_approved_at: new Date(finalizedAt).toISOString(),
            }, null, finalizedAt);
            nWinners++;

            add('Notification', {
              type: 'contest_won', title: 'You won!',
              description: `Your submission won a ${category} contest.`,
              recipient_user_id: winner.creator.id, contest_id: contestId, read: rnd() < 0.5,
            }, null, finalizedAt);
            nNotes++;
          }
        }
      }
    }
  }

  // ── Support tickets across the documented categories ────────────────────────
  const TICKET_CATS = ['account', 'contest', 'submission', 'payment', 'payout', 'tracker', 'winner', 'technical', 'security', 'other'];
  const TICKET_STATES = ['open', 'acknowledged', 'in_review', 'waiting_for_user', 'resolved', 'closed'];
  for (let i = 0; i < (small ? 12 : 80); i++) {
    const u = pick(rnd() < 0.75 ? creators : brands);
    const cat = pick(TICKET_CATS);
    add('SupportTicket', {
      user_id: u.id, user_email: u.email, user_role: u.userRole,
      ticket_id: `RK-S${String(i).padStart(4, '0')}`,
      category: cat, subject: `Question about ${cat}`,
      description: `Seeded QA ticket covering the ${cat} category.`,
      status: pick(TICKET_STATES), priority: ['payment', 'payout', 'security'].includes(cat) ? 'high' : 'normal',
    }, u.id, MONTH_AGO + Math.floor(rnd() * 30 * DAY));
    nTickets++;
  }

  // ── Bulk insert ─────────────────────────────────────────────────────────────
  console.log(`  writing ${rows.length} records…`);
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.record.createMany({
      data: rows.slice(i, i + 500).map((r) => {
        const { _id, ...data } = r.data;
        return { ...(_id ? { id: _id } : {}), entity: r.entity, data, createdById: r.createdById, createdDate: r.createdDate };
      }),
      skipDuplicates: true,
    });
  }

  console.log(`\n  contests ${nContests} · submissions ${nSubs} · links ${nLinks} · traffic events ${nEvents}`);
  console.log(`  score snapshots ${nSnaps} · winners ${nWinners} · notifications ${nNotes} · tickets ${nTickets}`);
  console.log(`\n  QA accounts: creator.qa01–10${QA_DOMAIN}, brand.qa01–05${QA_DOMAIN}`);
  console.log('  (QA passwords are documented in the specification; they are not printed here.)');
  console.log(`\n  Remove everything with:  npx tsx scripts/seed-simulation.ts --clean`);
}

(clean ? removeBatch() : seed())
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
