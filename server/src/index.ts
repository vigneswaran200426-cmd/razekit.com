import 'express-async-errors'; // makes async route errors reach the error handler (no 502s)
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { attachUser } from './auth/middleware.js';
import { authRouter } from './auth/routes.js';
import { entitiesRouter } from './entities/routes.js';
import { functionsRouter } from './functions/routes.js';
import { integrationsRouter } from './integrations/routes.js';
import { filesRouter } from './integrations/files.js';
import { miscRouter } from './misc/routes.js';
import { trafficRouter } from './traffic/routes.js';
import { paymentsRouter } from './payments/routes.js';
import { ensureFinanceConstraints } from './db.js';
import { startScheduler } from './scheduler.js';

const app = express();

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(cookieParser());

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(attachUser);

// Public campaign redirect (Brand Traffic attribution). Must stay above the
// API routers so /r/:code is never shadowed.
app.use('/r', trafficRouter);
app.use('/files', filesRouter);
app.use('/api/auth', authRouter);
app.use('/api/entities', entitiesRouter);
app.use('/api/functions', functionsRouter);
app.use('/api/integrations/core', integrationsRouter);
// Multipart money routes (funding proof, admin UPI QR). Each re-checks
// ownership or the finance permission itself.
app.use('/api/payments', paymentsRouter);
app.use('/api', miscRouter);

app.get('/', (_req, res) => res.json({ service: 'razekit-api', ok: true }));
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Keep implementation details in server logs; public clients get a stable 5xx message.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error('[error]', err);

  const safeMessage =
    status < 500 && typeof err?.message === 'string'
      ? err.message
      : 'Something went wrong. Please try again.';

  res.status(status).json({ error: safeMessage });
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

app.listen(config.port, () => {
  console.log(`\n🚀 RazeKit API on http://localhost:${config.port}  (env: ${config.env})`);
  console.log(`   CORS origins: ${config.corsOrigins.join(', ')}`);
  // Database-level duplicate protection for the ledger. Application checks
  // race; a unique index does not. A failure here is reported loudly rather
  // than silently downgrading the guarantee.
  ensureFinanceConstraints().then((r) => {
    if (r.ok) console.log('   Finance constraints: ok');
    else console.error('   Finance constraints NOT applied — duplicate protection is application-level only:', r.error);
  });
  startScheduler();
});
