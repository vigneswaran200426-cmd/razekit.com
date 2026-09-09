import { Router } from 'express';
import { HANDLERS, HTTP_ALLOWED, ADMIN_ONLY, PUBLIC_FUNCTIONS } from './registry.js';
import { makeFnCtx } from './context.js';
import { requireAuth } from '../auth/middleware.js';
import { EntityError } from '../entities/service.js';
import { functionsLimiter } from '../middleware/rateLimit.js';

export const functionsRouter = Router();

// base44.functions.invoke(name, payload) → POST /api/functions/:name
// requireAuth is applied per-function so a small public allowlist (finalized
// winner results) can be browsed by visitors, while everything else stays gated.
const maybeAuth = (req: any, res: any, next: any) =>
  PUBLIC_FUNCTIONS.has(req.params.name) ? next() : requireAuth(req, res, next);

functionsRouter.post('/:name', functionsLimiter, maybeAuth, async (req, res) => {
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
