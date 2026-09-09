import { Router } from 'express';
import { HANDLERS, HTTP_ALLOWED, ADMIN_ONLY } from './registry.js';
import { makeFnCtx } from './context.js';
import { requireAuth } from '../auth/middleware.js';
import { EntityError } from '../entities/service.js';
import { functionsLimiter } from '../middleware/rateLimit.js';

export const functionsRouter = Router();

// base44.functions.invoke(name, payload) → POST /api/functions/:name
functionsRouter.post('/:name', functionsLimiter, requireAuth, async (req, res) => {
  const name = req.params.name;
  if (!HTTP_ALLOWED.has(name)) return res.status(404).json({ error: `Unknown function: ${name}` });
  if (ADMIN_ONLY.has(name) && req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const out = await (HANDLERS as any)[name](makeFnCtx(req));
    res.status(out?.status || 200).json(out?.json ?? out ?? {});
  } catch (e: any) {
    const status = e instanceof EntityError ? e.status : e?.status || 500;
    if (status >= 500) console.error(`[functions:${name}]`, e);
    res.status(status).json({ error: e?.message || 'Internal error' });
  }
});
