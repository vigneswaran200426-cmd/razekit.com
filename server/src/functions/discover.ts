// @ts-nocheck
// Public contest discovery.
//
// Discover used to read the Contest entity straight from the browser. That read
// is public by design — Contest's RLS read rule is `{}` — and it returned every
// open contest, including the ones seeded client accounts create for simulation
// runs. So /discover advertised 61 "open briefs" while platformStats, which does
// exclude seeded accounts, counted 5 real contests. Worse, every seeded row
// carries `status: 'open'` with a deadline already in the past, so the page's own
// headline contradicted every card beneath it.
//
// Seeded rows are excluded here for exactly the reason winnersShowcase excludes
// them: a visitor cannot tell a simulated brief from a real one, and the platform
// should not ask them to. The root fix is removing simulation data from
// production (`npm run clean:sim`), which needs database access; this makes the
// public surface honest in the meantime, and stays correct afterwards.
import { json } from './context.js';
import { realUserIds } from '../compliance/seedAccounts.js';

/**
 * Drop seeded rows, then cut to the page size — in that order.
 *
 * Order matters: the seeded contests are the newest rows, so slicing first and
 * filtering after would return a page made almost entirely of records that are
 * about to be dropped, and a visitor would see an all-but-empty Discover.
 *
 * Exported so the filtering can be tested without a database.
 */
export function publicContests(rows, realIds, limit) {
  return (rows || [])
    .filter((c) => c && realIds.has(c.created_by_id))
    .slice(0, limit);
}

/**
 * Keep only rows whose owner is a real account.
 *
 * Shared by the creator directory and the work gallery because they had the
 * same hole: both read a fully-public entity (UserProfile.rls.read and
 * Post.rls.read are both `{}`) straight from the browser with no filter, so the
 * seeded demo creator — "Aria Fields", demo.creator@razekit.demo — was the
 * single creator a brand saw when they opened Explore.
 */
export function ownedByRealAccounts(rows, realIds, ownerField, limit) {
  return (rows || [])
    .filter((r) => r && realIds.has(r[ownerField]))
    .slice(0, limit);
}

/**
 * The public Explore directory: creators, and the work they published.
 *
 * Same rule as contestDiscover and winnersShowcase — membership, not absence.
 * A profile whose owner no longer resolves to an account is not a creator a
 * brand can brief, so it is not listed.
 */
export async function exploreDirectory(ctx) {
  const svc = ctx.svc;
  const limit = Math.min(Number(ctx.body?.limit) || 200, 300);

  const [profiles, posts, realIds] = await Promise.all([
    svc.entities.UserProfile.list('-created_date', Math.min(limit * 4, 1000)).catch(() => []),
    svc.entities.Post.list('-created_date', Math.min(limit * 4, 1000)).catch(() => []),
    realUserIds(),
  ]);

  return json({
    creators: ownedByRealAccounts(profiles, realIds, 'user_id', limit),
    work: ownedByRealAccounts(posts, realIds, 'author_id', limit),
  });
}

/** Open contests a visitor may browse, seeded accounts excluded. */
export async function contestDiscover(ctx) {
  const svc = ctx.svc;
  const limit = Math.min(Number(ctx.body?.limit) || 200, 300);

  // Over-read, because the rows removed below are the most recent ones.
  const [rows, realIds] = await Promise.all([
    svc.entities.Contest
      .filter({ status: 'open' }, '-created_date', Math.min(limit * 4, 1000))
      .catch(() => []),
    realUserIds(),
  ]);

  return json({ contests: publicContests(rows, realIds, limit) });
}
