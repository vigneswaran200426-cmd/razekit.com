// In-process rate limiting (spec 20/22).
//
// Protects the endpoints where abuse is cheap and damaging: credential
// stuffing on login, OTP/reset flooding, and hammering the tracking redirect
// to inflate Brand Traffic.
//
// Deliberately in-memory. RazeKit runs as a single Render service today, and a
// limiter that actually ships beats a Redis design that does not. If this ever
// scales horizontally the counters must move to a shared store — the logic is
// isolated in this one file so that swap stays contained.
import type { Request, Response, NextFunction } from 'express';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Keep memory bounded even under a distributed attack.
const MAX_KEYS = 50_000;

function hit(key: string, windowMs: number, max: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size > MAX_KEYS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > max) return { limited: true, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { limited: false, retryAfter: 0 };
}

function clientIp(req: Request) {
  const fwd = (req.headers['x-forwarded-for'] as string) || '';
  return fwd.split(',')[0]?.trim() || req.ip || 'unknown';
}

/**
 * @param name     bucket namespace
 * @param max      requests allowed per window
 * @param windowMs window length in ms
 * @param byUser   scope to the authenticated user when one is present
 */
export function rateLimit(name: string, max: number, windowMs: number, byUser = false) {
  return (req: Request, res: Response, next: NextFunction) => {
    const who = byUser && (req as any).user?.id ? `u:${(req as any).user.id}` : `ip:${clientIp(req)}`;
    const { limited, retryAfter } = hit(`${name}:${who}`, windowMs, max);
    if (limited) {
      res.setHeader('Retry-After', String(retryAfter));
      // Generic on purpose: never confirm whether an account exists.
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    return next();
  };
}

export const authLimiter = rateLimit('auth', 10, 5 * 60_000);       // login/register, per IP
export const otpLimiter = rateLimit('otp', 5, 10 * 60_000);         // OTP + password reset
export const trackingLimiter = rateLimit('track', 120, 60_000);     // redirect endpoint
export const functionsLimiter = rateLimit('fn', 120, 60_000, true); // server functions, per user

/** Test seam so limits can be asserted deterministically. */
export function __resetRateLimits() {
  buckets.clear();
}
