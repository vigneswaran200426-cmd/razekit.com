// Who gets to say whose row this is.
//
// The bug this exists for: an entity whose READ policy is scoped to a field —
// `{"data.user_id": "{{user.id}}"}` — decides ownership from that field. If the
// CREATE policy is a bare `true`, any signed-in client can post a row naming
// somebody else in it, and that person then reads it as their own.
//
// Confirmed live against production before the fix: account A created a
// UserPreference row carrying account B's user_id with show_earnings:true and
// notif_payouts:false, and B read it back as their settings. On a platform that
// moves money, silencing someone's payout notifications and publishing their
// earnings is not a cosmetic bug.
//
// created_by_id is not a defence here. The server stamps it correctly — the
// attacking row showed A as its creator — but every one of these read policies
// keys off the DATA field, not the stamped column, so the stamp is never
// consulted.
//
// Listing today's six would not stop tomorrow's, so this asserts the RULE: if
// ANY signed-in client can create an entity whose read decides ownership from a
// data field, the create policy must pin that field to the caller. A new entity
// added without that pin fails here.
//
// Entities whose create is already gated on a role are deliberately out of
// scope — see createIsRestricted below for why widening this test breaks the
// product rather than securing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PROTECTED_FIELDS } from '../src/entities/protected.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemas = JSON.parse(readFileSync(join(here, '..', 'src', 'entities', 'schemas.json'), 'utf8'));

/** Every `data.<field>` a policy compares against the current user. */
function ownershipFields(policy: unknown): Set<string> {
  const found = new Set<string>();
  const walk = (p: any) => {
    if (!p || typeof p !== 'object') return;
    for (const [k, v] of Object.entries<any>(p)) {
      if (k === '$or' || k === '$and') { (v as any[]).forEach(walk); continue; }
      if (k.startsWith('data.') && v === '{{user.id}}') found.add(k.slice(5));
    }
  };
  walk(policy);
  return found;
}

/**
 * True when creating this entity is already restricted to someone trusted to
 * name another party.
 *
 * This distinction is the whole difficulty, and the first version of this test
 * got it wrong — it flagged eleven entities that are not holes at all:
 *
 *   · AccountStanding, BadgeAward, ContextFootage, Warning and XpTransaction
 *     are admin-create-only. An admin naming another user is the feature, not
 *     an attack; a regular client cannot create them at all.
 *
 *   · Submission, WinnerPublish, SocialCampaignPost and FootageAccessRequest
 *     are role-gated AND two-sided. A submission legitimately carries the
 *     client_id of the brand whose contest it answers — the creator is a
 *     creator, and the counterparty is somebody else by definition. Pinning
 *     client_id to the caller there would not harden anything; it would make
 *     submitting work impossible.
 *
 * So the rule is narrower than "ownership fields must be pinned". It is: an
 * entity ANY signed-in client can create, whose read decides ownership from a
 * data field, must pin that field. That is exactly the shape that was
 * exploitable.
 */
function createIsRestricted(policy: unknown): boolean {
  if (policy === false) return true;        // nobody may create it
  if (policy === true) return false;        // any signed-in client — the risky case
  const blob = JSON.stringify(policy ?? null);
  // A role requirement means the creator had to be granted something first.
  return /"user_condition"/.test(blob);
}

/** True when the create policy pins this field to the caller. */
function createPinsField(policy: unknown, field: string): boolean {
  if (createIsRestricted(policy)) return true;
  return ownershipFields(policy).has(field);
}

function guarded(entity: string): Set<string> | '*' {
  const list = (PROTECTED_FIELDS as Record<string, string[]>)[entity];
  if (!list) return new Set();
  if (list.includes('*')) return '*';
  return new Set(list);
}

test('a client cannot create a row that names someone else as its owner', () => {
  const holes: string[] = [];

  for (const [entity, def] of Object.entries<any>(schemas)) {
    const rls = def?.rls || {};
    const owners = ownershipFields(rls.read);
    if (!owners.size) continue;             // read is not ownership-scoped

    const g = guarded(entity);
    if (g === '*') continue;                // entity is server-only end to end

    for (const field of owners) {
      // Either the field is server-only, or create must pin it to the caller.
      if (g !== '*' && g.has(field)) continue;
      if (createPinsField(rls.create, field)) continue;
      holes.push(`${entity}.${field}`);
    }
  }

  assert.deepEqual(
    holes, [],
    'These entities decide ownership from a data field that a client may set '
    + 'freely at create time, so one user can author a row another user will '
    + 'read as their own. Either add the field to PROTECTED_FIELDS, or scope '
    + 'rls.create to it:\n'
    + '  "create": { "$or": [ { "data.<field>": "{{user.id}}" }, '
    + '{ "user_condition": { "role": "admin" } } ] }\n  ' + holes.join('\n  '),
  );
});

test('the six that were exploitable are pinned now', () => {
  // Named so a refactor that loosens one fails loudly rather than quietly
  // reopening a hole that was reachable from a browser.
  const mustPin: Array<[string, string]> = [
    ['UserPreference', 'user_id'],      // set another user's privacy + notifications
    ['Report', 'reporter_id'],          // file a report in someone else's name
    ['OtpVerification', 'client_id'],   // attribute an OTP check to another client
    ['DownloadLog', 'user_id'],         // forge another user's download history
    ['DownloadSession', 'worker_id'],   // open a session naming another worker
    ['PostSave', 'user_id'],            // write into someone else's saved list
  ];
  for (const [entity, field] of mustPin) {
    const rls = (schemas as any)[entity]?.rls || {};
    const g = guarded(entity);
    assert.ok(
      (g !== '*' && g.has(field)) || createPinsField(rls.create, field),
      `${entity}.${field} must be pinned to the caller at create time`,
    );
  }
});

test('pinning did not make a legitimate create impossible', () => {
  // The opposite failure: scoping create so tightly that the owner cannot make
  // their own row. Each must still be creatable by the person it belongs to.
  for (const [entity, field] of [
    ['UserPreference', 'user_id'],
    ['Report', 'reporter_id'],
    ['PostSave', 'user_id'],
  ] as Array<[string, string]>) {
    const rls = (schemas as any)[entity]?.rls || {};
    assert.notEqual(rls.create, false, `${entity} must still be creatable by its owner`);
    const g = guarded(entity);
    assert.ok(
      g === '*' || !g.has(field),
      `${entity}.${field} is server-only, so a client can never create its own row — `
      + 'pin it via rls.create instead of PROTECTED_FIELDS',
    );
  }
});
