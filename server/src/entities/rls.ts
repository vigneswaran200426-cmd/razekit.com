// RLS engine — faithfully evaluates the Base44 row-level-security DSL exported
// in each entity's `rls` block. This is the security boundary that replaces
// Base44 platform RLS, so it is intentionally strict and well-tested.
//
// Policy DSL (as seen in base44/entities/*.jsonc):
//   {}                                  → public (anyone, even anonymous)
//   true                                → any AUTHENTICATED user
//   false                               → nobody
//   { "created_by_id": "{{user.id}}" }  → row owner (platform-trusted column)
//   { "data.<field>": "{{user.id}}" }   → row.data.<field> == current user id
//   { "user_condition": { "role": "admin" } }        → user attribute match
//   { "user_condition": { "user_role": "client" } }  → user attribute match
//   { "$or": [ ... ] } / { "$and": [ ... ] }          → boolean combinators
//   multiple keys in one object                        → AND of those keys

export interface RlsUser {
  id: string;
  role?: string;
  user_role?: string;
  [k: string]: unknown;
}

export interface RowLike {
  createdById?: string | null;
  data?: any;
}

type Policy = boolean | Record<string, any>;

function resolveTemplate(value: unknown, user: RlsUser | null): unknown {
  if (typeof value === 'string' && value.includes('{{user.id}}')) {
    if (!user) return undefined;
    return value.replace('{{user.id}}', user.id);
  }
  return value;
}

function matchUserCondition(uc: Record<string, unknown>, user: RlsUser | null): boolean {
  if (!user) return false;
  return Object.entries(uc).every(([k, v]) => (user as Record<string, unknown>)[k] === v);
}

// ── In-memory check (used for get / create / update / delete) ─────────────────
export function canAccess(policy: Policy, user: RlsUser | null, row: RowLike): boolean {
  if (policy === true) return !!user;
  if (policy === false) return false;
  if (policy && typeof policy === 'object') {
    const keys = Object.keys(policy);
    if (keys.length === 0) return true; // public
    return keys.every((k) => evalKey(k, policy[k], user, row));
  }
  return false;
}

function evalKey(key: string, val: any, user: RlsUser | null, row: RowLike): boolean {
  if (key === '$or') return (val as Policy[]).some((c) => canAccess(c, user, row));
  if (key === '$and') return (val as Policy[]).every((c) => canAccess(c, user, row));
  if (key === 'user_condition') return matchUserCondition(val, user);
  if (key === 'created_by_id') {
    const want = resolveTemplate(val, user);
    return want !== undefined && row.createdById === want;
  }
  const field = key.startsWith('data.') ? key.slice(5) : key;
  const want = resolveTemplate(val, user);
  if (want === undefined) return false;
  return (row.data || {})[field] === want;
}

// ── Query pushdown (used for list / filter reads) ─────────────────────────────
// Compiles a read policy into an exact Prisma `where` fragment so RLS is
// enforced in the database, never by over-fetching. Returns:
//   { all: true }        → no restriction
//   { none: true }       → matches nothing
//   { where }            → prisma where fragment
type Compiled = { all?: true; none?: true; where?: any };

const ALL: Compiled = { all: true };
const NONE: Compiled = { none: true };

function combineAnd(parts: Compiled[]): Compiled {
  if (parts.some((p) => p.none)) return NONE;
  const wheres = parts.filter((p) => p.where).map((p) => p.where);
  if (wheres.length === 0) return ALL;
  if (wheres.length === 1) return { where: wheres[0] };
  return { where: { AND: wheres } };
}

function combineOr(parts: Compiled[]): Compiled {
  if (parts.some((p) => p.all)) return ALL;
  const wheres = parts.filter((p) => p.where).map((p) => p.where);
  if (wheres.length === 0) return NONE;
  if (wheres.length === 1) return { where: wheres[0] };
  return { where: { OR: wheres } };
}

function compile(policy: Policy, user: RlsUser | null): Compiled {
  if (policy === true) return user ? ALL : NONE;
  if (policy === false) return NONE;
  if (policy && typeof policy === 'object') {
    const keys = Object.keys(policy);
    if (keys.length === 0) return ALL; // public
    return combineAnd(keys.map((k) => compileKey(k, policy[k], user)));
  }
  return NONE;
}

function compileKey(key: string, val: any, user: RlsUser | null): Compiled {
  if (key === '$or') return combineOr((val as Policy[]).map((c) => compile(c, user)));
  if (key === '$and') return combineAnd((val as Policy[]).map((c) => compile(c, user)));
  if (key === 'user_condition') return matchUserCondition(val, user) ? ALL : NONE;
  if (key === 'created_by_id') {
    const want = resolveTemplate(val, user);
    return want === undefined ? NONE : { where: { createdById: want } };
  }
  const field = key.startsWith('data.') ? key.slice(5) : key;
  const want = resolveTemplate(val, user);
  if (want === undefined) return NONE;
  return { where: { data: { path: [field], equals: want as any } } };
}

// Returns a Prisma where fragment for the read policy, or the sentinel
// { __deny: true } meaning "match nothing".
export function readWhere(policy: Policy, user: RlsUser | null): { deny: boolean; where: any } {
  const c = compile(policy, user);
  if (c.all) return { deny: false, where: {} };
  if (c.none) return { deny: true, where: {} };
  return { deny: false, where: c.where };
}
