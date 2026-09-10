// Entity service — the faithful replacement for Base44's `base44.entities.*`.
// Exposes the SAME method surface (filter/get/list/create/update/delete) in two
// modes:
//   • user-scoped  → RLS enforced (frontend REST calls, req.user)
//   • service role → RLS bypassed (backend functions, == Base44 asServiceRole)
//
// Records are stored in the generic `records` table as JSONB documents and
// returned FLATTENED (id, created_date, created_by_id, updated_date + data
// fields) so existing frontend code keeps working unchanged.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prisma, adminPrisma } from '../db.js';
import { isAdminEntity } from './routing.js';
import { canAccess, readWhere, type RlsUser } from './rls.js';
import { publicUser } from '../auth/users.js';
import { coreIntegrations } from '../integrations/core.js';

type EntitySchema = {
  name: string;
  required: string[];
  defaults: Record<string, unknown>;
  fields: string[];
  rls: { read: any; create: any; update: any; delete: any };
};

// Load entity schemas from the JSON sitting next to this module (works in both
// tsx dev — src/entities/schemas.json — and the compiled build — dist/entities/
// schemas.json, copied by scripts/copy-assets.mjs). Avoids import-attribute
// syntax so it runs on any Node 18+.
const __schemasPath = join(dirname(fileURLToPath(import.meta.url)), 'schemas.json');
const SCHEMAS = JSON.parse(readFileSync(__schemasPath, 'utf8')) as Record<string, EntitySchema>;

const META_KEYS = new Set(['id', 'created_date', 'created_by_id', 'updated_date']);

import { assertNoProtectedWrite } from './protected.js';
import { enforceContestFairness, touchesFairness } from '../contest/guard.js';

export class EntityError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface Ctx {
  user: RlsUser | null;
  serviceRole: boolean;
  /**
   * Optional Prisma client bound to an open transaction (see db.withTransaction).
   * When present every read and write in this context joins that transaction,
   * so a multi-step financial posting commits as one unit or not at all.
   */
  db?: any;
}

export const serviceCtx: Ctx = { user: null, serviceRole: true };
export const userCtx = (user: RlsUser | null): Ctx => ({ user, serviceRole: false });

function schema(entity: string): EntitySchema {
  const s = SCHEMAS[entity];
  if (!s) throw new EntityError(`Unknown entity: ${entity}`, 404);
  return s;
}

function flatten(row: { id: string; data: any; createdById: string | null; createdDate: Date; updatedDate: Date }) {
  return {
    id: row.id,
    created_by_id: row.createdById ?? undefined,
    created_date: row.createdDate.toISOString(),
    updated_date: row.updatedDate.toISOString(),
    ...(row.data || {}),
  };
}

function stripMeta(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (!META_KEYS.has(k)) out[k] = v;
  }
  return out;
}

function applyDefaults(entity: string, data: Record<string, unknown>) {
  const { defaults } = schema(entity);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(defaults)) {
    if (data[k] === undefined) out[k] = v;
  }
  return { ...out, ...data };
}

function assertRequired(entity: string, data: Record<string, unknown>) {
  const { required } = schema(entity);
  for (const key of required) {
    if (key === 'created_by_id' || key === 'role') continue; // platform-managed
    if (data[key] === undefined || data[key] === null || data[key] === '') {
      throw new EntityError(`Missing required field '${key}' for ${entity}`, 400);
    }
  }
}

// Parse a Base44 sort string ('-created_date' | 'field') for scalar columns.
function scalarOrderBy(sort?: string): any | null {
  if (!sort) return { createdDate: 'desc' };
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? 'desc' : 'asc';
  if (field === 'created_date') return { createdDate: dir };
  if (field === 'updated_date') return { updatedDate: dir };
  return null; // JSON field → sort in memory
}

function inMemorySort<T extends Record<string, any>>(rows: T[], sort?: string): T[] {
  if (!sort) return rows;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => {
    const av = a[field], bv = b[field];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    return (av < bv ? -1 : 1) * (desc ? -1 : 1);
  });
}

function whereFromQuery(entity: string, query: Record<string, unknown>): any[] {
  const clauses: any[] = [];
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined) continue;
    if (k === 'id') clauses.push({ id: v });
    else if (k === 'created_by_id') clauses.push({ createdById: v });
    else if (k === 'created_date') clauses.push({ createdDate: v });
    else clauses.push({ data: { path: [k], equals: v as any } });
  }
  return clauses;
}

// ── User entity special-case (maps to AppUser auth table) ─────────────────────
const flattenUser = publicUser;

const USER_COLUMNS: Record<string, string> = {
  email: 'email',
  full_name: 'fullName',
  role: 'role',
  user_role: 'userRole',
  account_status: 'accountStatus',
  onboarding_completed: 'onboardingCompleted',
  email_verified: 'emailVerified',
};

function userPatch(patch: Record<string, unknown>) {
  const cols: Record<string, unknown> = {};
  const profile: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(stripMeta(patch))) {
    if (USER_COLUMNS[k]) cols[USER_COLUMNS[k]] = v;
    else profile[k] = v;
  }
  return { cols, profile };
}

function isAdmin(ctx: Ctx) {
  return ctx.serviceRole || ctx.user?.role === 'admin';
}

async function userFilter(ctx: Ctx, query: Record<string, unknown>, sort?: string, limit?: number) {
  const db: any = ctx.db || prisma;
  // Admin (or service) may list/query all users; a normal user may only read self.
  if (!isAdmin(ctx)) {
    if (!ctx.user) return [];
    const self = await db.appUser.findUnique({ where: { id: ctx.user.id } });
    if (!self) return [];
    const flat = flattenUser(self);
    // apply query equality on self
    const ok = Object.entries(query || {}).every(([k, v]) => v === undefined || (flat as any)[k] === v);
    return ok ? [flat] : [];
  }
  const where: any = {};
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined) continue;
    if (k === 'id') where.id = v;
    else if (USER_COLUMNS[k]) where[USER_COLUMNS[k]] = v;
  }
  const orderBy = sort === 'created_date' ? { createdDate: 'asc' as const } : { createdDate: 'desc' as const };
  const rows = await db.appUser.findMany({ where, orderBy, take: limit ?? 200 });
  return rows.map(flattenUser);
}

// ── Public API factory ────────────────────────────────────────────────────────
function makeEntityMethods(entity: string, ctx: Ctx) {
  const s = schema(entity);
  const isUser = entity === 'User';
  // Admin-only entities live in their own database and therefore can never
  // join a platform transaction — passing them the tx client would silently
  // write them to the wrong database. Everything else uses the transaction
  // client when there is one, so the whole operation stays atomic.
  const db: any = isAdminEntity(entity) ? adminPrisma : (ctx.db || prisma);

  return {
    async filter(query: Record<string, unknown> = {}, sort?: string, limit?: number) {
      if (isUser) return userFilter(ctx, query, sort, limit);
      const clauses = whereFromQuery(entity, query);
      const and: any[] = [{ entity }, ...clauses];
      if (!ctx.serviceRole) {
        const rls = readWhere(s.rls.read, ctx.user);
        if (rls.deny) return [];
        if (rls.where && Object.keys(rls.where).length) and.push(rls.where);
      }
      const orderBy = scalarOrderBy(sort);
      const rows = await db.record.findMany({
        where: { AND: and },
        ...(orderBy ? { orderBy } : {}),
        ...(orderBy && limit ? { take: limit } : {}),
      });
      let flat = rows.map(flatten);
      if (!orderBy) {
        flat = inMemorySort(flat, sort);
        if (limit) flat = flat.slice(0, limit);
      }
      return flat;
    },

    async list(sort?: string, limit?: number) {
      return this.filter({}, sort, limit);
    },

    async get(id: string) {
      if (isUser) {
        const u = await db.appUser.findUnique({ where: { id } });
        if (!u) throw new EntityError('User not found', 404);
        if (!isAdmin(ctx) && ctx.user?.id !== id) throw new EntityError('Forbidden', 403);
        return flattenUser(u);
      }
      const row = await db.record.findFirst({ where: { id, entity } });
      if (!row) throw new EntityError(`${entity} not found`, 404);
      if (!ctx.serviceRole && !canAccess(s.rls.read, ctx.user, row)) {
        throw new EntityError('Forbidden', 403);
      }
      return flatten(row);
    },

    async create(obj: Record<string, unknown> = {}) {
      if (isUser) throw new EntityError('Users are created via the auth endpoints', 400);
      const data = applyDefaults(entity, stripMeta(obj));
      if (!ctx.serviceRole) assertNoProtectedWrite(entity, stripMeta(obj));
      const createdById = (obj.created_by_id as string) || ctx.user?.id || null;
      if (!ctx.serviceRole && !canAccess(s.rls.create, ctx.user, { createdById, data })) {
        throw new EntityError('Forbidden', 403);
      }
      assertRequired(entity, data);
      // Prize -> duration fairness is enforced here so no API path can bypass it.
      if (entity === 'Contest') {
        enforceContestFairness(data, (m: string, c: number) => { throw new EntityError(m, c); });
      }
      const row = await db.record.create({ data: { entity, data: data as any, createdById } });
      // Event hook: new Contest → generate artwork (replaces the Base44
      // "Contest Visual Assets" entity-trigger workflow). Fire-and-forget.
      if (entity === 'Contest') {
        import('../scheduler.js')
          .then((m) => m.onContestCreated(row.id))
          .catch(() => {});
      }
      return flatten(row);
    },

    async update(id: string, patch: Record<string, unknown> = {}) {
      if (isUser) {
        const u = await db.appUser.findUnique({ where: { id } });
        if (!u) throw new EntityError('User not found', 404);
        if (!isAdmin(ctx) && ctx.user?.id !== id) throw new EntityError('Forbidden', 403);
        const { cols, profile } = userPatch(patch);
        // Non-admins may never change role/status via the entity API.
        // Non-admins may never change role/status/user_role via the entity API.
        // user_role gates Contest/Submission/WinnerPublish creation, so letting a
        // user self-assign it is a privilege escalation.
        if (!isAdmin(ctx)) { delete cols.role; delete cols.accountStatus; delete cols.userRole; }
        const merged = { ...(u.profile as any), ...profile };
        const updated = await db.appUser.update({
          where: { id },
          data: { ...cols, profile: merged as any },
        });
        return flattenUser(updated);
      }
      const row = await db.record.findFirst({ where: { id, entity } });
      if (!row) throw new EntityError(`${entity} not found`, 404);
      if (!ctx.serviceRole && !canAccess(s.rls.update, ctx.user, row)) {
        throw new EntityError('Forbidden', 403);
      }
      if (!ctx.serviceRole) {
        assertNoProtectedWrite(entity, stripMeta(patch), (row.data as any) || {});
      }
      const data = { ...(row.data as any), ...stripMeta(patch) };
      // Re-validate only when prize/deadline/start actually change, so existing
      // contests created before this rule are never retro-broken.
      if (entity === 'Contest' && touchesFairness(stripMeta(patch))) {
        enforceContestFairness(data, (m: string, c: number) => { throw new EntityError(m, c); });
      }
      const updated = await db.record.update({ where: { id }, data: { data: data as any } });
      return flatten(updated);
    },

    async delete(id: string) {
      if (isUser) {
        if (!isAdmin(ctx)) throw new EntityError('Forbidden', 403);
        await db.appUser.delete({ where: { id } }).catch(() => {});
        return {};
      }
      const row = await db.record.findFirst({ where: { id, entity } });
      if (!row) throw new EntityError(`${entity} not found`, 404);
      if (!ctx.serviceRole && !canAccess(s.rls.delete, ctx.user, row)) {
        throw new EntityError('Forbidden', 403);
      }
      await db.record.delete({ where: { id } });
      return {};
    },
  };
}

export type EntityMethods = ReturnType<typeof makeEntityMethods>;

// Proxy that mirrors `base44.entities.<Name>` for a given context.
export function makeEntities(ctx: Ctx): Record<string, EntityMethods> {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        return makeEntityMethods(prop, ctx);
      },
    }
  ) as Record<string, EntityMethods>;
}

// Convenience: a service-role client shaped like the Base44 SDK the ported
// backend code expects (`svc.entities.X...`, `svc.integrations.Core.*`).
export function serviceClient(db?: any) {
  const ctx: Ctx = db ? { user: null, serviceRole: true, db } : serviceCtx;
  return { entities: makeEntities(ctx), integrations: { Core: coreIntegrations }, db: db || null };
}

export function knownEntity(name: string): boolean {
  return Boolean(SCHEMAS[name]);
}

export { SCHEMAS };
