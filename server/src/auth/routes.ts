import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword } from './password.js';
import { signToken } from './tokens.js';
import { issueOtp, verifyOtp } from './otp.js';
import { publicUser } from './users.js';
import { requireAuth } from './middleware.js';
import { sendEmail } from '../integrations/email.js';
import { buildGoogleAuthUrl, exchangeGoogleCode } from './oauth.js';

export const authRouter = Router();

const norm = (e: string) => String(e || '').trim().toLowerCase();

// ── Register (email/password) → sends verification OTP ───────────────────────
authRouter.post('/register', async (req, res) => {
  const email = norm(req.body?.email);
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const existing = await prisma.appUser.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'An account already exists with this email.' });
  const passwordHash = await hashPassword(password);
  await issueOtp(email, 'register', { passwordHash, full_name: req.body?.full_name || '' });
  res.json({ ok: true, requiresOtp: true });
});

// ── Verify register OTP → creates the user, returns a session token ──────────
authRouter.post('/verify-otp', async (req, res) => {
  const email = norm(req.body?.email);
  const code = String(req.body?.code || req.body?.otpCode || '');
  if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
  const result = await verifyOtp(email, 'register', code);
  if (!result.ok) return res.status(400).json({ error: result.error });
  let user = await prisma.appUser.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.appUser.create({
      data: {
        email,
        passwordHash: (result.payload.passwordHash as string) || null,
        fullName: (result.payload.full_name as string) || null,
        emailVerified: true,
        userRole: 'visitor',
        role: 'user',
      },
    });
  } else {
    user = await prisma.appUser.update({ where: { id: user.id }, data: { emailVerified: true } });
  }
  res.json({ access_token: signToken(user.id), user: publicUser(user) });
});

// ── Resend register OTP ──────────────────────────────────────────────────────
authRouter.post('/resend-otp', async (req, res) => {
  const email = norm(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const last = await prisma.authOtp.findFirst({
    where: { email, purpose: 'register' },
    orderBy: { createdAt: 'desc' },
  });
  const payload = (last?.payload as Record<string, unknown>) || {};
  await issueOtp(email, 'register', payload);
  res.json({ ok: true });
});

// ── Login (email/password) ───────────────────────────────────────────────────
authRouter.post('/login', async (req, res) => {
  const email = norm(req.body?.email);
  const password = String(req.body?.password || '');
  const user = await prisma.appUser.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.accountStatus === 'suspended' || user.accountStatus === 'deleted' || user.accountStatus === 'deactivated') {
    return res.status(403).json({ error: 'This account is not active.' });
  }
  res.json({ access_token: signToken(user.id), user: publicUser(user) });
});

// ── Current session ──────────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.appUser!));
});

// ── Update own profile (auth.updateMe) ───────────────────────────────────────
const SELF_COLUMNS: Record<string, string> = { full_name: 'fullName', user_role: 'userRole', onboarding_completed: 'onboardingCompleted' };
const updateMe = async (req: any, res: any) => {
  const body = req.body || {};
  const cols: Record<string, unknown> = {};
  const profile: Record<string, unknown> = { ...(req.appUser!.profile as any) };
  for (const [k, v] of Object.entries(body)) {
    if (['id', 'email', 'role', 'account_status', 'created_date', 'updated_date'].includes(k)) continue; // protected
    if (SELF_COLUMNS[k]) cols[SELF_COLUMNS[k]] = v;
    else profile[k] = v;
  }
  const updated = await prisma.appUser.update({ where: { id: req.appUser!.id }, data: { ...cols, profile: profile as any } });
  res.json(publicUser(updated));
};
authRouter.patch('/me', requireAuth, updateMe);
authRouter.post('/me', requireAuth, updateMe);

// ── Password reset (token link) ──────────────────────────────────────────────
authRouter.post('/password/reset-request', async (req, res) => {
  const email = norm(req.body?.email);
  if (email) {
    const user = await prisma.appUser.findUnique({ where: { email } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      await prisma.authOtp.updateMany({ where: { email, purpose: 'reset', consumed: false }, data: { consumed: true } });
      await prisma.authOtp.create({
        data: {
          email,
          purpose: 'reset',
          codeHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      const link = `${config.webBaseUrl}/reset-password?token=${token}`;
      await sendEmail({ to: email, subject: 'Reset your RazeKit password', body: `Reset your password: ${link}\nThis link expires in 30 minutes.` });
    }
  }
  res.json({ ok: true }); // always ok (no account enumeration)
});

authRouter.post('/password/reset', async (req, res) => {
  const token = String(req.body?.resetToken || req.body?.token || '');
  const newPassword = String(req.body?.newPassword || req.body?.password || '');
  if (!token || newPassword.length < 8) return res.status(400).json({ error: 'Invalid token or password too short' });
  const codeHash = createHash('sha256').update(token).digest('hex');
  const rec = await prisma.authOtp.findFirst({ where: { purpose: 'reset', codeHash, consumed: false }, orderBy: { createdAt: 'desc' } });
  if (!rec || rec.expiresAt.getTime() < Date.now()) return res.status(400).json({ error: 'This reset link is invalid or expired.' });
  const user = await prisma.appUser.findUnique({ where: { email: rec.email } });
  if (!user) return res.status(400).json({ error: 'Invalid reset link.' });
  await prisma.appUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await prisma.authOtp.update({ where: { id: rec.id }, data: { consumed: true } });
  res.json({ ok: true });
});

// ── Logout (stateless) ───────────────────────────────────────────────────────
authRouter.post('/logout', (_req, res) => res.json({ ok: true }));

// ── Google OAuth ─────────────────────────────────────────────────────────────
authRouter.get('/oauth/google', (req, res) => {
  if (!config.google.clientId) return res.status(501).json({ error: 'Google OAuth is not configured' });
  const returnTo = String(req.query.returnTo || config.webBaseUrl);
  res.redirect(buildGoogleAuthUrl(returnTo));
});

authRouter.get('/oauth/google/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const returnTo = safeReturn(state);
    const profile = await exchangeGoogleCode(code);
    let user = await prisma.appUser.findFirst({ where: { OR: [{ googleId: profile.sub }, { email: profile.email }] } });
    if (!user) {
      user = await prisma.appUser.create({
        data: { email: profile.email, googleId: profile.sub, fullName: profile.name, emailVerified: true, userRole: 'visitor', role: 'user' },
      });
    } else if (!user.googleId) {
      user = await prisma.appUser.update({ where: { id: user.id }, data: { googleId: profile.sub, emailVerified: true } });
    }
    const token = signToken(user.id);
    // Hand the token back to the SPA via the URL (adapter reads & stores it).
    const sep = returnTo.includes('?') ? '&' : '?';
    res.redirect(`${returnTo}${sep}access_token=${token}`);
  } catch (e) {
    res.redirect(`${config.webBaseUrl}/login?error=oauth`);
  }
});

function safeReturn(state: string): string {
  try {
    const url = new URL(state, config.webBaseUrl);
    if (url.origin === new URL(config.webBaseUrl).origin) return url.toString();
  } catch {}
  return config.webBaseUrl;
}
