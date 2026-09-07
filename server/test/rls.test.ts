// Tests for the RLS engine — the security boundary replacing Base44 RLS.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, readWhere } from '../src/entities/rls.js';

const admin = { id: 'a1', role: 'admin' };
const client = { id: 'u1', role: 'user', user_role: 'client' };
const creator = { id: 'u2', role: 'user', user_role: 'creator' };

test('public read {} allows anyone incl anonymous', () => {
  assert.equal(canAccess({}, null, { data: {} }), true);
  assert.equal(canAccess({}, client, { data: {} }), true);
});

test('create:true requires authentication', () => {
  assert.equal(canAccess(true, null, { data: {} }), false);
  assert.equal(canAccess(true, client, { data: {} }), true);
});

test('created_by_id owner policy', () => {
  const policy = { created_by_id: '{{user.id}}' };
  assert.equal(canAccess(policy, client, { createdById: 'u1', data: {} }), true);
  assert.equal(canAccess(policy, client, { createdById: 'other', data: {} }), false);
  assert.equal(canAccess(policy, null, { createdById: 'u1', data: {} }), false);
});

test('data.<field> owner policy', () => {
  const policy = { 'data.recipient_user_id': '{{user.id}}' };
  assert.equal(canAccess(policy, client, { data: { recipient_user_id: 'u1' } }), true);
  assert.equal(canAccess(policy, client, { data: { recipient_user_id: 'zzz' } }), false);
});

test('user_condition role/user_role', () => {
  assert.equal(canAccess({ user_condition: { role: 'admin' } }, admin, { data: {} }), true);
  assert.equal(canAccess({ user_condition: { role: 'admin' } }, client, { data: {} }), false);
  assert.equal(canAccess({ user_condition: { user_role: 'client' } }, client, { data: {} }), true);
  assert.equal(canAccess({ user_condition: { user_role: 'client' } }, creator, { data: {} }), false);
});

test('$or combines owner OR admin (Contest update policy)', () => {
  const policy = { $or: [{ created_by_id: '{{user.id}}' }, { user_condition: { role: 'admin' } }] };
  assert.equal(canAccess(policy, client, { createdById: 'u1', data: {} }), true); // owner
  assert.equal(canAccess(policy, admin, { createdById: 'someoneelse', data: {} }), true); // admin
  assert.equal(canAccess(policy, creator, { createdById: 'u1', data: {} }), false); // neither
});

test('Handover two-party read (client OR winner OR admin)', () => {
  const policy = { $or: [{ 'data.client_id': '{{user.id}}' }, { 'data.winner_id': '{{user.id}}' }, { user_condition: { role: 'admin' } }] };
  const row = { data: { client_id: 'u1', winner_id: 'u2' } };
  assert.equal(canAccess(policy, client, row), true);
  assert.equal(canAccess(policy, creator, row), true);
  assert.equal(canAccess(policy, { id: 'u9', role: 'user' }, row), false);
});

test('readWhere pushdown: public → no restriction', () => {
  const r = readWhere({}, null);
  assert.equal(r.deny, false);
  assert.deepEqual(r.where, {});
});

test('readWhere pushdown: admin sees all, non-owner denied to just their rows', () => {
  const policy = { $or: [{ 'data.brand_id': '{{user.id}}' }, { user_condition: { role: 'admin' } }] };
  const adminWhere = readWhere(policy, admin);
  assert.equal(adminWhere.deny, false);
  assert.deepEqual(adminWhere.where, {}); // admin → unrestricted

  const clientWhere = readWhere(policy, client);
  assert.equal(clientWhere.deny, false);
  assert.deepEqual(clientWhere.where, { data: { path: ['brand_id'], equals: 'u1' } });

  const anon = readWhere(policy, null);
  assert.equal(anon.deny, true); // no owner match possible, not admin
});

test('readWhere pushdown: admin-only read denies non-admins', () => {
  const policy = { user_condition: { role: 'admin' } };
  assert.equal(readWhere(policy, admin).deny, false);
  assert.equal(readWhere(policy, client).deny, true);
});
