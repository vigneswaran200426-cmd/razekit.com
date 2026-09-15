// Which database each entity lives in.
//
// RazeKit runs one API against up to two Neon projects:
//
//   PLATFORM database  users, contests, submissions, winners, the ledger,
//                      funding, payouts, audit — everything the product is
//   ADMIN database     records that exist only for the operations console
//
// The admin console reads BOTH: platform data to administer, admin data to
// record what staff did about it.
//
// ── Why the split is deliberately small ─────────────────────────────────────
//
// Two databases cannot share a transaction. Anything written inside a platform
// transaction must therefore stay in the platform database, or it can commit
// when the transaction rolled back — or vanish when it committed.
//
// That rules out AuditLog. Finance writes audit rows inside `withTransaction`
// alongside the ledger postings they describe. An audit trail that can disagree
// with the money it records is worse than no audit trail, so AuditLog stays
// with the ledger. The admin console still reads it — cross-database reads are
// safe, it is only cross-database *writes inside a transaction* that are not.
//
// AdminPermission is a read on every finance call and a write only from an
// audited grant/revoke, never inside a money transaction, so it is safe here.
export const ADMIN_DB_ENTITIES = new Set([
  // Trust & Safety: filed by users, actioned by staff. Nothing in the platform
  // reads these to make a decision about money or a winner.
  'TrustReport',
  // What staff did about a report. Applying a suspension also updates
  // app_users in the platform database — that is two writes, not one
  // transaction, and `adminEnforcementAction` orders them so the record is
  // written first and the account change is the step that can be retried.
  'EnforcementAction',
  // Who may perform which finance operation. Read-mostly; granting is its own
  // audited action and never part of a ledger transaction.
  'AdminPermission',
]);

/** True when this entity's rows live in the admin database (if one is configured). */
export function isAdminEntity(entity: string): boolean {
  return ADMIN_DB_ENTITIES.has(entity);
}
