import { base44 } from '@/api/base44Client';

const RESERVED = ['admin', 'support', 'api', 'official', 'system', 'root', 'moderator', 'help', 'info', 'contact', 'about', 'settings', 'login', 'register', 'search', 'explore', 'contest', 'creator', 'client', 'dashboard'];

export function validateUsername(username) {
  const u = username.toLowerCase().trim();
  if (u.length < 3) return { valid: false, error: 'Must be at least 3 characters' };
  if (u.length > 20) return { valid: false, error: 'Must be 20 characters or less' };
  if (!/^[a-z0-9._]+$/.test(u)) return { valid: false, error: 'Only letters, numbers, _ and .' };
  if (u.startsWith('.') || u.startsWith('_')) return { valid: false, error: 'Cannot start with . or _' };
  if (u.endsWith('.') || u.endsWith('_')) return { valid: false, error: 'Cannot end with . or _' };
  if (u.includes('..') || u.includes('__')) return { valid: false, error: 'No consecutive . or _' };
  if (RESERVED.includes(u)) return { valid: false, error: 'This username is reserved' };
  return { valid: true, error: null };
}

export function suggestUsernames(username, displayName) {
  const base = (displayName || username).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  if (!base) return [];
  const suggestions = [`${base}01`, `${base}_fx`, `${base}motion`, `${base}editor`, `${base}pro`, `${base}fx`];
  return [...new Set(suggestions)].filter(s => validateUsername(s).valid).slice(0, 3);
}

export async function checkUsernameAvailable(username) {
  const result = validateUsername(username);
  if (!result.valid) return { available: false, error: result.error, suggestions: [] };
  try {
    const existing = await base44.entities.UserProfile.filter({ username: username.toLowerCase() }, '-created_date', 1);
    if (existing.length > 0) return { available: false, error: 'Already taken', suggestions: suggestUsernames(username) };
    return { available: true, error: null, suggestions: [] };
  } catch {
    return { available: true, error: null, suggestions: [] };
  }
}

export async function getUserProfile(userId) {
  try {
    const profiles = await base44.entities.UserProfile.filter({ user_id: userId }, '-created_date', 1);
    return profiles[0] || null;
  } catch {
    return null;
  }
}

export async function getUserProfileByUsername(username) {
  try {
    const profiles = await base44.entities.UserProfile.filter({ username: username.toLowerCase() }, '-created_date', 1);
    return profiles[0] || null;
  } catch {
    return null;
  }
}

export async function saveUsername(userId, username, displayName) {
  const existing = await getUserProfile(userId);
  const now = new Date().toISOString();
  if (existing) {
    return await base44.entities.UserProfile.update(existing.id, {
      username: username.toLowerCase(),
      display_name: displayName || existing.display_name,
      username_last_changed: now,
    });
  }
  return await base44.entities.UserProfile.create({
    username: username.toLowerCase(),
    display_name: displayName || '',
    user_id: userId,
    username_last_changed: now,
  });
}

export function canChangeUsername(lastChanged) {
  if (!lastChanged) return { canChange: true, nextDate: null };
  const last = new Date(lastChanged);
  const next = new Date(last.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (next > new Date()) return { canChange: false, nextDate: next };
  return { canChange: true, nextDate: null };
}

export function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}