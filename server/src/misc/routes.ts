// Small compatibility + housekeeping endpoints.
import { Router } from 'express';
import { PRIZE_TIERS, GLOBAL_MAX_DAYS, DURATION_RULE_VERSION } from '../contest/duration.js';

export const miscRouter = Router();

// Replaces the Base44 public-settings call in AuthContext.jsx.
miscRouter.get('/public-settings', (_req, res) => {
  res.json({
    name: 'Razekit',
    auth: { providers: ['password', 'google'] },
    maintenance: false,
  });
});

// Contest fairness rule TABLE (not logic) so the creation UI can show the
// allowed duration live without duplicating the rule. The server remains the
// only enforcer — see contest/guard.ts.
miscRouter.get('/contest-rules', (_req, res) => {
  res.json({
    ruleVersion: DURATION_RULE_VERSION,
    globalMaxDays: GLOBAL_MAX_DAYS,
    tiers: PRIZE_TIERS.map((t) => ({
      tier: t.tier,
      maxPrize: t.maxPrize === Infinity ? null : t.maxPrize,
      minDays: t.minDays,
      maxDays: t.maxDays,
      label: t.label,
    })),
  });
});

// Replaces base44.analytics.track — accept and drop (or forward to your analytics).
miscRouter.post('/analytics/track', (_req, res) => res.json({ ok: true }));

miscRouter.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
