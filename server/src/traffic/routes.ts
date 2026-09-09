// Public traffic redirect. Mounted at /r/:code.
//
// This is the ONLY endpoint an ordinary visitor hits. It resolves a stored,
// pre-validated destination — the destination is never taken from the request,
// so this cannot be used as an open redirect.
import { Router } from 'express';
import { recordClick, resolveLink } from './service.js';
import { config } from '../config.js';

export const trafficRouter = Router();

trafficRouter.get('/:code', async (req, res) => {
  const code = String(req.params.code || '');
  let destination: string | null = null;

  try {
    const link = await resolveLink(code);
    destination = (link && (link as any).destination_url) || null;

    // Record asynchronously-ish, but never let tracking break the visitor's trip.
    await recordClick({
      code,
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      userAgent: req.headers['user-agent'] as string,
      referrer: req.headers['referer'] as string,
      viewerUserId: (req as any).user?.id || null,
    }).catch(() => {});
  } catch {
    // fall through to the safe default below
  }

  if (!destination) {
    return res.redirect(302, `${config.webBaseUrl}/?link=invalid`);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return res.redirect(302, destination);
});
