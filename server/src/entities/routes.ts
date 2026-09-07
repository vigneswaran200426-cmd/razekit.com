import { Router } from 'express';
import { makeEntities, userCtx, EntityError, knownEntity } from './service.js';

export const entitiesRouter = Router();

function handle(res: any, err: unknown) {
  if (err instanceof EntityError) return res.status(err.status).json({ error: err.message });
  console.error('[entities] error:', err);
  return res.status(500).json({ error: (err as Error)?.message || 'Internal error' });
}

entitiesRouter.param('entity', (req, res, next, entity) => {
  if (!knownEntity(entity)) return res.status(404).json({ error: `Unknown entity: ${entity}` });
  next();
});

// Query (filter/list). POST so complex filters travel in the body.
entitiesRouter.post('/:entity/query', async (req, res) => {
  try {
    const api = makeEntities(userCtx(req.user ?? null));
    const { where = {}, sort, limit } = req.body || {};
    const rows = await api[req.params.entity].filter(where, sort, limit);
    res.json(rows);
  } catch (e) {
    handle(res, e);
  }
});

// List via GET (?sort=&limit=)
entitiesRouter.get('/:entity', async (req, res) => {
  try {
    const api = makeEntities(userCtx(req.user ?? null));
    const sort = req.query.sort as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(await api[req.params.entity].list(sort, limit));
  } catch (e) {
    handle(res, e);
  }
});

entitiesRouter.get('/:entity/:id', async (req, res) => {
  try {
    const api = makeEntities(userCtx(req.user ?? null));
    res.json(await api[req.params.entity].get(req.params.id));
  } catch (e) {
    handle(res, e);
  }
});

entitiesRouter.post('/:entity', async (req, res) => {
  try {
    const api = makeEntities(userCtx(req.user ?? null));
    res.json(await api[req.params.entity].create(req.body || {}));
  } catch (e) {
    handle(res, e);
  }
});

entitiesRouter.patch('/:entity/:id', async (req, res) => {
  try {
    const api = makeEntities(userCtx(req.user ?? null));
    res.json(await api[req.params.entity].update(req.params.id, req.body || {}));
  } catch (e) {
    handle(res, e);
  }
});

entitiesRouter.delete('/:entity/:id', async (req, res) => {
  try {
    const api = makeEntities(userCtx(req.user ?? null));
    res.json(await api[req.params.entity].delete(req.params.id));
  } catch (e) {
    handle(res, e);
  }
});
