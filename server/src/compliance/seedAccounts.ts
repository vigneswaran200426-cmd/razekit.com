// Which accounts are not real — and therefore must never appear in a public
// count, a public showcase or a public ranking.
//
// Seeded creators, demo brands and simulation runs exist so the platform can be
// exercised end to end, and once rendered they are indistinguishable from the
// real thing: the same names, the same prize amounts, the same finalized scores.
// The only thing separating a real winner from a fabricated one is this list.
//
// It lives in exactly one place because two definitions of "real" drifting apart
// is precisely how the homepage came to report 2 winners while the public
// Winners page published 109 — 107 of them simulated, with invented brands and
// prize money, presented to visitors as finalized results.
import { prisma } from '../db.js';

export const SEED_SUFFIXES = ['@razekit.test', '@razekit.demo', '@razekit.sim'];

export const isSeedEmail = (email?: string | null): boolean =>
  SEED_SUFFIXES.some((s) => String(email || '').endsWith(s));

/** A Prisma `where` fragment that excludes seeded accounts. */
export const notSeedWhere = {
  NOT: { OR: SEED_SUFFIXES.map((s) => ({ email: { endsWith: s } })) },
};

/**
 * The ids of every seeded account.
 *
 * Deliberately a full read rather than a join: these accounts are created on
 * purpose and there are few of them, and every caller needs the whole set to
 * filter records that only carry a user id.
 */
export async function seedUserIds(): Promise<Set<string>> {
  const rows = await prisma.appUser
    .findMany({
      where: { OR: SEED_SUFFIXES.map((s) => ({ email: { endsWith: s } })) },
      select: { id: true },
    })
    .catch(() => [] as Array<{ id: string }>);
  return new Set(rows.map((u) => u.id));
}
