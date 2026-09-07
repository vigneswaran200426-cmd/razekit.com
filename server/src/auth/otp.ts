// Auth-level one-time codes for register verification and password reset.
// (Distinct from the app's OtpVerification entity used for footage access.)
import { createHash, randomInt } from 'node:crypto';
import { prisma } from '../db.js';
import { sendEmail } from '../integrations/email.js';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function genCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function issueOtp(email: string, purpose: 'register' | 'reset', payload: Record<string, unknown> = {}) {
  const code = genCode();
  await prisma.authOtp.updateMany({
    where: { email: email.toLowerCase(), purpose, consumed: false },
    data: { consumed: true },
  });
  await prisma.authOtp.create({
    data: {
      email: email.toLowerCase(),
      purpose,
      codeHash: hashCode(code),
      payload: payload as any,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  const subject = purpose === 'register' ? 'Your RazeKit verification code' : 'Reset your RazeKit password';
  await sendEmail({
    to: email,
    subject,
    body: `Your RazeKit code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`,
  });
  return { ok: true };
}

// Verifies the newest unconsumed code for (email, purpose). On success returns
// the stored payload and marks it consumed.
export async function verifyOtp(email: string, purpose: 'register' | 'reset', code: string) {
  const rec = await prisma.authOtp.findFirst({
    where: { email: email.toLowerCase(), purpose, consumed: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!rec) return { ok: false as const, error: 'No active code — request a new one.' };
  if (rec.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: 'Code expired — request a new one.' };
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await prisma.authOtp.update({ where: { id: rec.id }, data: { consumed: true } });
    return { ok: false as const, error: 'Too many attempts — request a new code.' };
  }
  if (rec.codeHash !== hashCode(code)) {
    await prisma.authOtp.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    return { ok: false as const, error: 'Incorrect code.' };
  }
  await prisma.authOtp.update({ where: { id: rec.id }, data: { consumed: true } });
  return { ok: true as const, payload: (rec.payload as Record<string, unknown>) || {} };
}
