// Single source of truth for how an AppUser row is presented to the app.
// `auth.me()`, the User entity API, and RLS all use these so the identity shape
// is identical everywhere.
import type { AppUser } from '@prisma/client';
import type { RlsUser } from '../entities/rls.js';

export function publicUser(u: AppUser) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.fullName ?? undefined,
    role: u.role,
    user_role: u.userRole,
    account_status: u.accountStatus,
    onboarding_completed: u.onboardingCompleted,
    email_verified: u.emailVerified,
    created_date: u.createdDate.toISOString(),
    updated_date: u.updatedDate.toISOString(),
    ...((u.profile as Record<string, unknown>) || {}),
  };
}

export function toRlsUser(u: AppUser): RlsUser {
  return { id: u.id, role: u.role, user_role: u.userRole };
}
