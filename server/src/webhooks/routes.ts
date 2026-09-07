// Provider webhooks. Mounted with a RAW body parser (signature verification
// needs the exact bytes), so this router must be registered BEFORE express.json().
//   Razorpay: POST /api/webhooks/money?provider=razorpay
//   Stripe:   POST /api/webhooks/money?provider=stripe
import { Router, raw } from 'express';
import { handleMoneyWebhook } from '../functions/webhook.js';

export const webhooksRouter = Router();

webhooksRouter.post('/money', raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    const provider = String(req.query.provider || '');
    const out = await handleMoneyWebhook({ rawBody, provider, headers: req.headers });
    res.status(out.status || 200).json(out.json);
  } catch (e: any) {
    console.error('[webhook] error', e);
    res.status(500).json({ error: e?.message || 'Webhook error' });
  }
});
