// @ts-nocheck
// Ported from base44/shared/visual/authz.ts (import extensions .ts→.js).
// Shared authorization helpers for the Visual Asset System's backend functions.
// Mirrors the frontend's isAppAdmin semantics: the platform `role` is
// server-authoritative, but an app owner who onboarded as a Client/Creator
// (user_role set) is a normal app user, not an app admin.
export function isPlatformAdmin(user) {
  return !!(user && user.role === "admin" && !user.user_role);
}

export function assertAuthorized(user) {
  if (!user || !user.id) throw new UnauthorizedError("Unauthorized");
}

export class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.code = "unauthorized";
  }
}

export class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.code = "forbidden";
    this.status = 403;
  }
}