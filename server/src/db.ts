import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Run `fn` inside one database transaction.
 *
 * Money operations are multi-step: check the request is still pending, post a
 * ledger credit, create a prize commitment, flip a status, write an audit row.
 * Half of that is worse than none of it — a contest marked funded with no
 * ledger entry behind it is exactly the failure that makes a platform pay out
 * money it never received. Everything inside runs or nothing does.
 *
 * `fn` receives a Prisma client bound to the transaction; pass it to
 * serviceClient(tx) so every entity write joins the same transaction.
 */
export async function withTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => fn(tx), {
    // Money reads must not see a half-applied write from a concurrent verify.
    isolationLevel: 'Serializable',
    // Long enough for a multi-step financial posting, short enough that a stuck
    // request cannot hold a row lock indefinitely.
    timeout: 20_000,
    maxWait: 10_000,
  });
}

/**
 * Take a row-level write lock inside the current transaction.
 *
 * This is what makes "two admins click Verify at the same moment" resolve to
 * one credit rather than two: the second transaction blocks here until the
 * first commits, then re-reads the row and sees it is no longer pending.
 *
 * Returns false when the row does not exist.
 */
export async function lockRecord(tx: any, id: string): Promise<boolean> {
  // `records.id` is a text column (Prisma String), not a native uuid — casting
  // the parameter to ::uuid makes Postgres refuse the comparison outright.
  const rows: any[] = await tx.$queryRaw`SELECT id FROM records WHERE id = ${id} FOR UPDATE`;
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Database-level duplicate protection for the ledger.
 *
 * Application checks race; a unique index does not. Two concurrent postings
 * with the same idempotency key cannot both commit, whatever the application
 * code believes. Created here rather than in a Prisma migration because the
 * document store keeps these values inside JSONB.
 */
export async function ensureFinanceConstraints(): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS ledger_txn_idempotency_uniq
      ON records ((data->>'idempotency_key'))
      WHERE entity = 'LedgerTransaction' AND data->>'idempotency_key' IS NOT NULL
    `);
    // One active funding request per contest — a brand cannot open two funding
    // requests and pay one of them twice.
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS funding_active_per_contest_uniq
      ON records ((data->>'contest_id'))
      WHERE entity = 'ContestFunding'
        AND data->>'status' NOT IN ('CANCELLED','REFUNDED','REJECTED')
    `);
    // A bank UTR identifies exactly one real transfer, so it may appear on at
    // most one live funding request.
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS funding_reported_reference_uniq
      ON records ((data->>'reported_reference'))
      WHERE entity = 'ContestFunding'
        AND data->>'reported_reference' IS NOT NULL
        AND data->>'status' NOT IN ('CANCELLED','REJECTED')
    `);
    // One open withdrawal request per creator at a time.
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_active_per_user_uniq
      ON records ((data->>'user_id'))
      WHERE entity = 'WithdrawalRequest'
        AND data->>'status' IN ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING','TRANSFER_SENT','ON_HOLD')
    `);
    // Helpful, not corrective: keeps the finance queues fast as volume grows.
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS records_entity_status_idx
      ON records (entity, (data->>'status'))
    `);
    return { ok: true };
  } catch (e: any) {
    // A missing index degrades duplicate protection to the application layer —
    // real, but not a reason to refuse to boot. Report it loudly instead.
    return { ok: false, error: e?.message || String(e) };
  }
}
