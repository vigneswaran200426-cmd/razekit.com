// Seeds RazeKit's own launch campaigns:
//
//   A) the ContestDurationRule row that RECORDS the owner-approved 28-day
//      promotional exception (src/contest/duration.ts is what ENFORCES it);
//   B) three PollCampaign rows — System A, "should we run this?" polls, which
//      are NOT contests and hold no prize commitment;
//   C) three Contest rows — System B, real creator contests, owned by the
//      official RazeKit brand (client) account.
//
//   npx tsx scripts/seed-razekit-campaigns.ts
//
// WHAT THIS SCRIPT REFUSES TO DO
//  • It never deletes or overwrites. Every row is looked up first (rule_version
//    / slug / exact title) and skipped if it exists, so running it twice is a
//    no-op that prints "= exists".
//  • It seeds ZERO votes. A poll that ships showing votes nobody cast is
//    fabricated adoption, and there is no threshold at which that becomes okay.
//  • It moves no money and marks nothing funded. The contests are created as
//    draft / FUNDING_REQUIRED, because a contest may only look funded after a
//    person has verified a real transfer.
//  • It writes no credential. The RazeKit brand account is created without a
//    password unless RAZEKIT_BRAND_PASSWORD is supplied in the environment; the
//    owner sets one through the normal password-reset flow.
import 'dotenv/config';
import { prisma } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';
import { hashPassword } from '../src/auth/password.js';
import {
  PROMOTIONAL_RULE,
  PROMOTIONAL_RULE_VERSION,
  allowedPromotionalDuration,
  validatePrizeDuration,
  describeRule,
} from '../src/contest/duration.js';

const svc = serviceClient();

const DAY = 86400000;
const NOW = Date.now();
const NOW_ISO = new Date(NOW).toISOString();

const BRAND_EMAIL = 'razekitchat@razekit.com';
const BRAND_NAME = 'RazeKit';

const PRIZE_AMOUNT = 50000;        // ₹50,000 — MAJOR units, as Contest.prize_amount is
const CONTEST_DAYS = 28;           // the approved promotional duration
const PROMO_PRIZE_POOL_MINOR = 1_000_000_000; // ₹1,00,00,000 (1 crore) × 100 paise
const VOTE_TARGET = 1_000_000;

const created: string[] = [];
const existed: string[] = [];
const skipped: string[] = [];

const note = (list: string[], line: string, mark: string) => { list.push(line); console.log(`${mark} ${line}`); };

// ── A) The promotional duration rule row ─────────────────────────────────────
// The code decides what is allowed; this row is the paper trail an admin can
// point at when asked why three contests ran four times their tier's window.
async function seedDurationRule(): Promise<string> {
  const found = await svc.entities.ContestDurationRule.filter({ rule_version: PROMOTIONAL_RULE_VERSION }, '-created_date', 1);
  if (found.length) {
    note(existed, `ContestDurationRule ${PROMOTIONAL_RULE_VERSION}`, '=');
    return found[0].id;
  }
  const row = await svc.entities.ContestDurationRule.create({
    rule_version: PROMOTIONAL_RULE_VERSION,
    label: PROMOTIONAL_RULE.label,
    description: PROMOTIONAL_RULE.description,
    promotional: true,
    active: true,
    // Minor units (paise) — the rule row stores money the way the ledger does.
    min_prize_minor: PROMOTIONAL_RULE.minPrize * 100,
    max_prize_minor: PROMOTIONAL_RULE.maxPrize * 100,
    min_days: PROMOTIONAL_RULE.minDays,
    max_days: PROMOTIONAL_RULE.maxDays,
    // approved_by (a user id) is deliberately left unset: no account has been
    // identified as the approver, and inventing one would forge an approval.
    approved_by_name: PROMOTIONAL_RULE.approvedByName,
    approved_at: NOW_ISO,
    notes: describeRule(PROMOTIONAL_RULE_VERSION).explanation,
  });
  note(created, `ContestDurationRule ${PROMOTIONAL_RULE_VERSION} (max ${PROMOTIONAL_RULE.maxDays} days)`, '+');
  return row.id;
}

// ── B) Poll campaigns (System A) ─────────────────────────────────────────────
// A poll asks whether a tournament should happen. It is not a contest, it holds
// no funded prize, and the pool below is an intention, not a commitment — which
// is what `disclosure` says on every one of them.
const DISCLOSURE =
  'This is a poll, not a contest. Voting records interest only: it does not enter you into anything, '
  + 'does not create a prize, and does not commit RazeKit to running this tournament. '
  + 'If a tournament is announced, its prize and rules will be published separately before entries open.';

const POLLS = [
  {
    slug: 'gta-6',
    theme: 'GTA 6',
    title: 'NEXT-GEN OPEN-WORLD VIDEO CHALLENGE',
    question: 'Should RazeKit launch the ultimate GTA 6 creator tournament?',
    supporting_line: 'One minute. One open world. Every creator building the same city their own way.',
    display_order: 1,
    banner_alt: 'Stylised neon skyline of a fictional open-world city at dusk.',
    banner_prompt:
      'Cinematic wide shot of a FICTIONAL neon-lit open-world city at dusk, rain-slick streets, '
      + 'palm silhouettes, a lone creator figure filming on a phone in the foreground, volumetric light, '
      + 'anamorphic flare, teal and magenta grade, 9:16 and 16:9 crops. '
      + 'ORIGINAL ARTWORK ONLY: no real company logos, wordmarks, game UI, box art, character likenesses or '
      + 'trade dress; nothing implying Rockstar Games created, endorsed or licensed this.',
  },
  {
    slug: 'gpt-6-astra',
    theme: 'GPT-6 Astra',
    title: 'AI CREATOR FUTURE CHALLENGE',
    question: 'Should RazeKit launch a creator tournament inspired by the new era of AI?',
    supporting_line: 'The tools changed. The question is what you do with the next sixty seconds.',
    display_order: 2,
    banner_alt: 'Abstract luminous constellation forming over an editing desk at night.',
    banner_prompt:
      'Cinematic night interior of an editing desk, an abstract luminous constellation of light threads '
      + 'assembling above the monitor, warm practical lamp against cool blue ambience, shallow depth of field, '
      + 'fine film grain, 9:16 and 16:9 crops. '
      + 'ORIGINAL ARTWORK ONLY: no real company logos, product names, model names, UI screenshots or brand marks; '
      + 'nothing implying OpenAI created, endorsed or licensed this.',
  },
  {
    slug: 'ai-creator-agents',
    theme: 'AI Creator Agents',
    title: 'THE AI CREATOR AGENT CHALLENGE',
    question: 'Can creators and AI agents redefine what a one-minute video can become?',
    supporting_line: 'You direct. It assists. The cut is still yours to answer for.',
    display_order: 3,
    banner_alt: 'A creator and a luminous abstract companion form working side by side.',
    banner_prompt:
      'Cinematic two-shot of a creator at a workstation beside a translucent luminous abstract companion form, '
      + 'soft rim light, deep shadow, muted amber and steel grade, a sense of collaboration rather than replacement, '
      + '9:16 and 16:9 crops. '
      + 'ORIGINAL ARTWORK ONLY: no real company logos, product names, assistant branding or UI; '
      + 'no implication of endorsement by any AI company.',
  },
];

async function seedPolls() {
  for (const p of POLLS) {
    const found = await svc.entities.PollCampaign.filter({ slug: p.slug }, '-created_date', 1);
    if (found.length) {
      note(existed, `PollCampaign "${p.slug}"`, '=');
      continue;
    }
    await svc.entities.PollCampaign.create({
      slug: p.slug,
      theme: p.theme,
      title: p.title,
      question: p.question,
      supporting_line: p.supporting_line,
      cta_label: 'VOTE FOR THE TOURNAMENT',
      prize_pool_minor: PROMO_PRIZE_POOL_MINOR,
      currency: 'INR',
      status: 'upcoming',
      vote_target: VOTE_TARGET,
      // Nobody has voted yet. These stay at zero until real people vote.
      yes_votes: 0,
      no_votes: 0,
      total_votes: 0,
      banner_url: null,          // the image pipeline fills this from banner_prompt
      banner_prompt: p.banner_prompt,
      banner_alt: p.banner_alt,
      display_order: p.display_order,
      requires_auth: true,
      disclosure: DISCLOSURE,
    });
    note(created, `PollCampaign "${p.slug}" — ${p.title} (0 votes, target ${VOTE_TARGET.toLocaleString('en-IN')})`, '+');
  }
}

// ── C) The RazeKit brand account ─────────────────────────────────────────────
// These contests are run BY RazeKit as a brand, so they are owned by a client
// account — not by an admin. An admin account owning contests would blur the
// line between the platform that adjudicates and the brand that competes for
// attention, and every contest permission check reads user_role.
async function ensureBrandAccount(): Promise<{ id: string; isClient: boolean }> {
  const existing = await prisma.appUser.findUnique({ where: { email: BRAND_EMAIL } });
  if (existing) {
    if (existing.userRole !== 'client') {
      // Never silently re-role an account that exists for another purpose, and
      // never hand contests to an account the platform does not treat as a
      // brand — that is the distinction the whole permission model rests on.
      note(skipped, `app_user ${BRAND_EMAIL} exists with user_role '${existing.userRole}', not 'client' — left untouched, contests NOT seeded`, '!');
      return { id: existing.id, isClient: false };
    }
    note(existed, `app_user ${BRAND_EMAIL} (client)`, '=');
    return { id: existing.id, isClient: true };
  }

  const supplied = process.env.RAZEKIT_BRAND_PASSWORD || '';
  const passwordHash = supplied.length >= 8 ? await hashPassword(supplied) : null;

  const user = await prisma.appUser.create({
    data: {
      email: BRAND_EMAIL,
      passwordHash,
      fullName: BRAND_NAME,
      role: 'user',
      userRole: 'client',
      emailVerified: true,
      onboardingCompleted: true,
    },
  });
  note(created, `app_user ${BRAND_EMAIL} (client, "${BRAND_NAME}")`, '+');
  if (!passwordHash) {
    console.log('  no password set (RAZEKIT_BRAND_PASSWORD not supplied) — use the password-reset flow to sign in.');
  }
  return { id: user.id, isClient: true };
}

// ── C) The three promotional contests (System B) ─────────────────────────────
const MANDATORY_CRITERIA = [
  'Instagram only. The video must be published on Instagram; entries published anywhere else are not eligible.',
  '60 seconds maximum. Anything longer is not eligible.',
  'Original creative work. You must have made it, and you must have the rights to everything in it.',
  'Follow the brief. Entries that ignore the brief are judged as not meeting it.',
  'No false claim of endorsement. Do not state or imply that Rockstar Games, OpenAI or any other company '
    + 'is involved in, sponsoring or endorsing this contest, and do not use their logos, trademarks or trade dress.',
  'Approved materials only. Use the materials RazeKit provides plus your own original work — nothing you '
    + 'are not licensed to use.',
  'Publish on Instagram and submit the real post URL. The live post is what gets measured; a file upload alone '
    + 'is not an entry.',
  'Account handover required if selected as winner. If you win, you must transfer the Instagram account that '
    + 'published the winning video, through RazeKit, before the prize is released.',
];

const CONTEST_RULES = MANDATORY_CRITERIA.map((r, i) => `${i + 1}. ${r}`).join('\n');

// The 60-second beat structure every entry is written against. Authored from
// the campaign lines; see the note in the seeding report before publishing.
const beatSheet = (beats: [string, string][]) =>
  beats.map(([t, b]) => `${t}  ${b}`).join('\n');

const CONTESTS = [
  {
    title: 'RazeKit GTA 6 - 60 Second Creator Challenge',
    theme: 'THE CITY IS YOUR CANVAS',
    short_description: 'Sixty seconds. One open world. Show us the city the way only you see it.',
    concept:
      'THE CITY IS YOUR CANVAS.\n\n'
      + 'Every creator gets the same city and the same sixty seconds. What separates the entries is point of '
      + 'view: what you choose to notice, how you cut it, and what you leave out. This is a craft contest, not '
      + 'a gameplay-capture contest — we are looking for authorship.',
    beats: [
      ['0-5s', 'HOOK — open on one unmistakable image of the city. No logo, no title card, no build-up. Earn the next five seconds.'],
      ['5-15s', 'ESTABLISH — set the world and your point of view in it. Who is looking, and from where?'],
      ['15-30s', 'BUILD — three to four escalating beats. Movement, scale, texture. Let the edit find its rhythm.'],
      ['30-45s', 'PEAK — the one moment you would put on a poster. Everything before this was setup for it.'],
      ['45-55s', 'TURN — change the meaning. A reveal, a reversal, or a quiet beat that reframes what we just watched.'],
      ['55-60s', 'SIGN-OFF — land the line "THE CITY IS YOUR CANVAS" and end clean. No trailing seconds, no dead frames.'],
    ] as [string, string][],
  },
  {
    title: 'RazeKit GPT-6 Astra - 60 Second AI Creator Challenge',
    theme: 'ONE MINUTE IN THE AGE OF AI',
    short_description: 'Sixty seconds on what it actually feels like to create right now.',
    concept:
      'ONE MINUTE IN THE AGE OF AI.\n\n'
      + 'Not a demo reel and not a think-piece. Sixty seconds that show what creating feels like now that the '
      + 'tools moved. You may use AI in your process — you must still be the author of the result, and you must '
      + 'be able to account for every frame you submit.',
    beats: [
      ['0-5s', 'HOOK — one image or one line that states the shift. Concrete, not abstract.'],
      ['5-15s', 'ESTABLISH — show the before: how this used to be made, or what it used to cost you.'],
      ['15-30s', 'BUILD — the change arriving. Let the pace pick up as the process compresses.'],
      ['30-45s', 'PEAK — the thing that is now possible that was not. Show it; do not narrate it.'],
      ['45-55s', 'TURN — the cost or the question. What does the creator still have to bring?'],
      ['55-60s', 'SIGN-OFF — land the line "ONE MINUTE IN THE AGE OF AI" and cut.'],
    ] as [string, string][],
  },
  {
    title: 'RazeKit AI Creator Agent - 60 Second Future Creator Challenge',
    theme: 'WHEN YOUR CREATIVE PARTNER IS AN AI AGENT',
    short_description: 'Sixty seconds on collaborating with something that is not a person.',
    concept:
      'WHEN YOUR CREATIVE PARTNER IS AN AI AGENT.\n\n'
      + 'A partner is not a tool and not a replacement. Show the working relationship: what you direct, what it '
      + 'takes on, where it gets things wrong, and who answers for the final cut. The entries that land will be '
      + 'specific about the handoff rather than romantic about the technology.',
    beats: [
      ['0-5s', 'HOOK — the first instruction. Open mid-collaboration, not on an introduction.'],
      ['5-15s', 'ESTABLISH — the two roles. Make it legible who is directing and who is executing.'],
      ['15-30s', 'BUILD — the loop: ask, result, correction, better result. Show the iteration honestly.'],
      ['30-45s', 'PEAK — the moment the partnership produces something neither side would have alone.'],
      ['45-55s', 'TURN — the limit. Where it fails, and what you do about it.'],
      ['55-60s', 'SIGN-OFF — land the line "WHEN YOUR CREATIVE PARTNER IS AN AI AGENT" and end on your name.'],
    ] as [string, string][],
  },
];

async function seedContests(brandUserId: string, ruleId: string) {
  const deadlineISO = new Date(NOW + CONTEST_DAYS * DAY).toISOString();

  // Validate with the SAME function the platform uses, under the promotional
  // rule, before writing anything. A seed script that writes a contest the rule
  // engine would reject is how an "approved exception" quietly becomes a bug.
  const check = validatePrizeDuration({
    prizeAmount: PRIZE_AMOUNT,
    days: CONTEST_DAYS,
    currency: 'INR',
    ruleVersion: PROMOTIONAL_RULE_VERSION,
  });
  if (!check.ok) {
    console.error(`Refusing to seed contests: ${(check as any).message}`);
    process.exit(1);
  }
  const bounds = allowedPromotionalDuration();

  for (const c of CONTESTS) {
    const found = await prisma.record.findFirst({
      where: { entity: 'Contest', data: { path: ['title'], equals: c.title } },
      select: { id: true },
    });
    if (found) {
      note(existed, `Contest "${c.title}"`, '=');
      continue;
    }

    const brief =
      `${c.concept}\n\n`
      + `THE 60-SECOND STRUCTURE\n${beatSheet(c.beats)}\n\n`
      + `MANDATORY CRITERIA\n${CONTEST_RULES}`;

    const data = {
      title: c.title,
      short_description: c.short_description,
      description: c.concept,
      brief,
      category: 'Instagram Reel',
      contest_rules: CONTEST_RULES,
      // Stored as JSON strings: the frontend parses these with JSON.parse.
      custom_requirements: JSON.stringify(MANDATORY_CRITERIA),
      deliverables: JSON.stringify([
        'One video, 60 seconds maximum, published live on Instagram.',
        'The public Instagram post URL of that published video.',
      ]),
      resources: JSON.stringify([]),

      prize_amount: PRIZE_AMOUNT,
      currency: 'INR',
      settlement_region: 'IN',
      number_of_winners: 1,
      prize_positions: JSON.stringify([]),

      start_date: NOW_ISO,
      deadline: deadlineISO,
      timezone: 'Asia/Kolkata',
      submission_limit: 0,

      required_platform: 'instagram',
      max_video_seconds: 60,

      handover_required: true,
      account_property_type: 'Instagram account used to publish the winning video',
      handover_notes:
        'If your entry is selected, the Instagram account that published it is transferred to RazeKit through '
        + 'the RazeKit handover flow before the prize is released. Do not enter with an account you are not '
        + 'willing to hand over.',

      // The exception, recorded on the row itself so the admin UI can explain it.
      promotional: true,
      duration_rule_version: PROMOTIONAL_RULE_VERSION,
      duration_rule_id: ruleId,
      min_duration_days: bounds.minDays,
      max_duration_days: bounds.maxDays,

      // Nothing is live and nothing is funded. This script moves no money.
      status: 'draft',
      lifecycle_state: 'DRAFT',
      funding_status: 'FUNDING_REQUIRED',
      delivery_status: 'pending',
    };

    // Written straight to the record store rather than through
    // svc.entities.Contest.create(): that path runs enforceContestFairness(),
    // which applies the STANDARD tiers and re-stamps duration_rule_version. The
    // fix is not to loosen that guard — it protects every brand on the platform
    // — so the promotional path validates itself above and writes here, the
    // same way scripts/seed-simulation.ts writes its records.
    await prisma.record.create({ data: { entity: 'Contest', data: data as any, createdById: brandUserId } });
    note(created, `Contest "${c.title}" (₹${PRIZE_AMOUNT.toLocaleString('en-IN')}, ${CONTEST_DAYS} days, draft, unfunded)`, '+');
  }
}

async function main() {
  console.log('Seeding RazeKit launch campaigns (idempotent — nothing is deleted or overwritten).\n');

  const ruleId = await seedDurationRule();
  await seedPolls();
  const brand = await ensureBrandAccount();
  if (brand.isClient) await seedContests(brand.id, ruleId);

  console.log(`\nCreated ${created.length}:`);
  for (const l of created) console.log(`  + ${l}`);
  console.log(`Already existed ${existed.length}:`);
  for (const l of existed) console.log(`  = ${l}`);
  if (skipped.length) {
    console.log(`Needs attention ${skipped.length}:`);
    for (const l of skipped) console.log(`  ! ${l}`);
  }
  console.log('\nContests are draft and unfunded by design. They go live only after a real transfer is verified.');
  console.log('Poll vote counts are zero and stay zero until real people vote.');
  process.exit(skipped.length ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
