// A sweep, not a checklist.
//
// The bug this exists for: several entities had rls.create === true — correct,
// because a user really does file a report, open a handover, start an OTP check
// — while their VERDICT fields were completely unguarded. A creator could
// create an OtpVerification with verified:true, a Handover with
// status:COMPLETED, or a Post with author_verified:true, straight from the
// browser through the generic entity API.
//
// Nothing read SocialConnection, so that one was only a loaded gun. The footage
// and handover ones were live.
//
// Listing today's offenders would not stop tomorrow's, so this asserts the RULE:
// any entity a client may create must have every verdict-shaped field on the
// server-only list. A new entity added without guards fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PROTECTED_FIELDS } from '../src/entities/protected.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemas = JSON.parse(readFileSync(join(here, '..', 'src', 'entities', 'schemas.json'), 'utf8'));

/**
 * Field names that decide something rather than describe something.
 *
 * A user may say what a report is ABOUT; they may not say it is RESOLVED. The
 * split is between input the user owns and a verdict the server owns.
 */
const VERDICT = [
  'verified', 'moderation_status', 'author_verified', 'approved',
  'reviewed_by', 'reviewed_at', 'resolution', 'severity',
  'downloads_used', 'max_downloads', 'revoked_at', 'revoked_by',
  'completed_at', 'verified_at', 'verified_by',
];

/** Fields a client legitimately writes even though the name looks decisive. */
const USER_OWNED = new Set([
  // A user really does choose these on their own row.
  'UserPreference.notif_winners',
  'UserPreference.notif_payouts',
  'UserPreference.notif_contests',
  'UserPreference.notif_submissions',
  'UserPreference.notif_support',
  'UserPreference.notif_security',
  // User role/status are stripped for non-admins in entities/service.ts's user
  // path, which is a different mechanism from PROTECTED_FIELDS.
  'User.role', 'User.user_role', 'User.account_status',
]);

function guardedFields(entity: string): Set<string> | '*' {
  const list = (PROTECTED_FIELDS as Record<string, string[]>)[entity];
  if (!list) return new Set();
  if (list.includes('*')) return '*';
  return new Set(list);
}

test('every client-creatable entity guards its verdict fields', () => {
  const holes: string[] = [];

  for (const [entity, def] of Object.entries<any>(schemas)) {
    const rls = def?.rls || {};
    // Only entities a client may actually create through the generic API.
    if (rls.create !== true) continue;

    const guarded = guardedFields(entity);
    if (guarded === '*') continue; // the whole entity is server-only

    for (const field of def.fields || []) {
      const key = `${entity}.${field}`;
      if (USER_OWNED.has(key)) continue;
      const decisive = VERDICT.some((v) => field === v || field.endsWith('_' + v));
      if (decisive && !guarded.has(field)) holes.push(key);
    }
  }

  assert.deepEqual(
    holes, [],
    'These fields decide an outcome but a browser can write them. Add each to '
    + 'PROTECTED_FIELDS in entities/protected.ts, or to USER_OWNED here if the '
    + 'user genuinely owns it:\n  ' + holes.join('\n  '),
  );
});

test('the specific fields that were exploitable are now guarded', () => {
  // Named explicitly so a future refactor that drops one fails loudly rather
  // than quietly reopening a hole that was actually reachable.
  const mustGuard: Array<[string, string]> = [
    ['OtpVerification', 'verified'],      // bypassed the gate on licensed footage
    ['DownloadSession', 'status'],        // self-approved a download session
    ['DownloadSession', 'downloads_used'],// reset one's own download count
    ['Handover', 'status'],               // marked one's own handover complete
    ['Post', 'author_verified'],          // self-awarded a verification badge
    ['Comment', 'moderation_status'],     // self-approved moderation
    ['Report', 'status'],                 // closed one's own report
    ['SocialConnection', 'verified'],     // forged an account-ownership claim
  ];
  for (const [entity, field] of mustGuard) {
    const guarded = guardedFields(entity);
    assert.ok(
      guarded === '*' || guarded.has(field),
      `${entity}.${field} must be server-only`,
    );
  }
});

test('guarding did not accidentally freeze an entity users must write', () => {
  // The opposite failure: over-guarding an entity so a legitimate action starts
  // returning 403. Each of these must still have SOMETHING a client can set.
  for (const entity of ['Report', 'Handover', 'Comment', 'Post', 'SupportTicket']) {
    const def = (schemas as any)[entity];
    if (!def) continue;
    const guarded = guardedFields(entity);
    assert.notEqual(guarded, '*', `${entity} is client-creatable, so '*' would make creation impossible`);
    const writable = (def.fields || []).filter((f: string) => !(guarded as Set<string>).has(f));
    assert.ok(writable.length > 0, `${entity} has no client-writable field left`);
  }
});
