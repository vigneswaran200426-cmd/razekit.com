// Serves locally-stored files (STORAGE_DRIVER=local). Public files are open;
// private files require a valid signed URL (?exp=&sig=) from CreateFileSignedUrl.
import { Router } from 'express';
import { readLocal, signLocal } from './storage.js';

export const filesRouter = Router();

filesRouter.get('/public/:key', async (req, res) => {
  const f = await readLocal('public', req.params.key);
  if (!f) return res.status(404).end();
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(f.buffer);
});

filesRouter.get('/private/:key', async (req, res) => {
  const key = req.params.key;
  const exp = Number(req.query.exp || 0);
  const sig = String(req.query.sig || '');
  if (!exp || exp < Date.now()) return res.status(403).json({ error: 'Link expired' });
  if (sig !== signLocal(key, exp)) return res.status(403).json({ error: 'Invalid signature' });
  const f = await readLocal('private', key);
  if (!f) return res.status(404).end();
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.end(f.buffer);
});
