import { base44 } from '@/api/base44Client';
import { checkUsernameAvailable } from '@/lib/username-utils';

export function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
}
export function isValidPhone(p) {
  return /^[+]?[\d\s\-()]{7,15}$/.test(p || '');
}

export function validateOnboarding(role, data) {
  const errors = {};
  if (!data.full_name?.trim()) errors.full_name = 'Required';
  if (!isValidPhone(data.phone)) errors.phone = 'Enter a valid phone';
  if (!data.country?.trim()) errors.country = 'Required';
  if (role === 'client') {
    if (!data.company_name?.trim()) errors.company_name = 'Required';
    if (!data.industry?.trim()) errors.industry = 'Required';
    if (!data.business_description?.trim()) errors.business_description = 'Required';
    if (!data.categories?.trim()) errors.categories = 'Select at least one';
  } else {
    if (!data.display_name?.trim()) errors.display_name = 'Required';
    if (!data.professional_title?.trim()) errors.professional_title = 'Required';
    if (!data.bio?.trim()) errors.bio = 'Required';
    if (!data.years_experience?.trim()) errors.years_experience = 'Required';
    if (!data.skills?.trim()) errors.skills = 'Select at least one';
    if (!data.tools?.trim()) errors.tools = 'Select at least one';
  }
  return errors;
}

// Auto-generate a unique, valid username from a seed (user never has to pick one).
async function generateUsername(seed) {
  const base = (seed || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'user';
  for (let i = 0; i < 8; i++) {
    const cand = `${base}${Math.random().toString(36).slice(2, 5)}`;
    const c = await checkUsernameAvailable(cand);
    if (c.available) return cand;
  }
  return `${base}${Date.now().toString(36).slice(-5)}`;
}

// Returns { profile, contact } — public display fields go on the public
// UserProfile; sensitive PII + admin-managed status go on the owner/admin-only
// UserContact entity so other users can never read them.
function buildProfilePayload(role, data, user, username, source) {
  const profile = {
    username,
    display_name: data.display_name || data.full_name || '',
    country: data.country || '',
    avatar_url: data.avatar_url || '',
  };
  const contact = {
    full_name: data.full_name || '',
    email: user.email,
    phone: data.phone || '',
    account_status: 'active',
    verification_status: 'unverified',
    registration_source: source || 'web',
  };
  if (role === 'client') {
    return {
      profile: {
        ...profile,
        company_name: data.company_name || '',
        industry: data.industry || '',
        website: data.website || '',
        company_size: data.company_size || '',
        business_description: data.business_description || '',
        bio: data.bio || data.business_description || '',
        categories: data.categories || '',
      },
      contact,
    };
  }
  return {
    profile: {
      ...profile,
      professional_title: data.professional_title || '',
      bio: data.bio || '',
      years_experience: data.years_experience || '',
      skills: data.skills || '',
      tools: data.tools || '',
      portfolio_url: data.portfolio_url || '',
      categories: data.skills || '',
    },
    contact,
  };
}

// Create the authoritative account: UserProfile record + role assigned once
// via the platform auth API (server-side) + audit trail + admin notification + email.
export async function createAccount({ user, role, data, source }) {
  const username = await generateUsername(data.display_name || data.full_name || user?.email);
  const profilePayload = buildProfilePayload(role, data, user, username, source);

  const { profile: profileFields, contact: contactFields } = profilePayload;
  const existing = await base44.entities.UserProfile
    .filter({ user_id: user.id }, '-created_date', 1).catch(() => []);
  let profileRec;
  if (existing[0]) {
    profileRec = await base44.entities.UserProfile.update(existing[0].id, profileFields);
  } else {
    profileRec = await base44.entities.UserProfile.create({ ...profileFields, user_id: user.id });
  }

  // Sensitive PII + admin-managed account/verification state live on the
  // owner/admin-only UserContact entity, never on the public UserProfile.
  const existingContact = await base44.entities.UserContact
    .filter({ user_id: user.id }, '-created_date', 1).catch(() => []);
  if (existingContact[0]) {
    await base44.entities.UserContact.update(existingContact[0].id, contactFields);
  } else {
    await base44.entities.UserContact.create({ ...contactFields, user_id: user.id });
  }

  // Role is set ONCE here. The platform's auth API is the only path used; the UI
  // never exposes user_role editing afterward, and post-onboarding role changes
  // require admin-only flows (admin escalation via the `role` field is blocked).
  await base44.auth.updateMe({
    full_name: data.full_name,
    user_role: role,
    onboarding_completed: true,
  });

  const actor = 'self';
  await base44.entities.AuditLog.create({ user_id: user.id, action: 'account_created', actor, status: 'active' }).catch(() => {});
  await base44.entities.AuditLog.create({ user_id: user.id, action: 'role_assigned', actor, status: role, reason: role }).catch(() => {});
  await base44.entities.AuditLog.create({ user_id: user.id, action: 'profile_created', actor, status: 'ok' }).catch(() => {});

  const label = role === 'client' ? 'Brand' : 'Creator';
  await base44.entities.Notification.create({
    type: 'system_announcement',
    title: `New ${label} registration`,
    description: `${data.full_name} (${user.email}) registered as ${label.toUpperCase()} — ${new Date().toLocaleString()}.`,
  }).catch(() => {});

  await base44.integrations.Core.SendEmail({
    to: user.email,
    subject: `Your ${label} account has been created`,
    body: `Hi ${data.full_name},\n\nYour ${label} account on CreatorContest has been created. Welcome aboard!\n\n— The CreatorContest team`,
  }).catch(() => {});

  return profileRec;
}