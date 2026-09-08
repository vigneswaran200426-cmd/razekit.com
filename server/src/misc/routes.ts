// Small compatibility + housekeeping endpoints.
import { Router } from 'express';
import { config } from '../config.js';

export const miscRouter = Router();

// Replaces the Base44 public-settings call in AuthContext.jsx.
miscRouter.get('/public-settings', (_req, res) => {
  res.json({
    name: 'Razekit',
    auth: { providers: ['password', 'google'] },
    maintenance: false,
    // Public payment surface (client ID only — never the secret).
    paypal: { configured: config.paypal.configured, clientId: config.paypal.clientId, env: config.paypal.env },
  });
});

// Replaces base44.analytics.track — accept and drop (or forward to your analytics).
miscRouter.post('/analytics/track', (_req, res) => res.json({ ok: true }));

miscRouter.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
