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
import { developmentRouter } from './development/routes.js';
import { trafficRouter } from './traffic/routes.js';
import { socialRouter } from './social/routes.js';
import { paymentsRouter } from './payments/routes.js';
import { ensureFinanceConstraints } from './db.js';
import { captureError, errorMiddleware } from './errors/capture.js';
import { securityHeaders } from './security/headers.js';
import { startScheduler } from './scheduler.js';

const app = express();

app.use(securityHeaders());
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
// OAuth callbacks from the social platforms. A GET route because it is a
// browser redirect; identity comes from the signed state, not a session.
app.use('/api/social', socialRouter);
app.use('/files', filesRouter);
app.use('/api/auth', authRouter);
app.use('/api/entities', entitiesRouter);
app.use('/api/functions', functionsRouter);
app.use('/api/integrations/core', integrationsRouter);
// Multipart money routes (funding proof, admin UPI QR). Each re-checks
// ownership or the finance permission itself.
app.use('/api/payments', paymentsRouter);
// The Development product area. Its domain logic lives in the RazeKit DEV
// engine; this router only authenticates the caller and scopes them to their
// own tenant. Mounted above miscRouter so its paths are never shadowed.
//
// Mounted ONLY when the area is switched on. Leaving it mounted and answering
// 401 or 503 would still tell anyone probing that the feature exists and is
// merely switched off; not mounting it means those paths fall through to the
// same 404 as any other path that was never built.
if (config.development.enabled) {
  app.use('/api/development', developmentRouter);
}
app.use('/api', miscRouter);

app.get('/', (_req, res) => res.json({ service: 'razekit-api', ok: true }));
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Redact, persist, and hand the client an id it can quote at support — never a
// stack, a SQL fragment or a server path. See src/errors/capture.ts.
app.use(errorMiddleware({ service: 'api' }));

// Background failures (scheduler, fire-and-forget hooks) never pass through the
// middleware, and they are the ones nobody sees. captureError never throws.
process.on('unhandledRejection', (e) => {
  void captureError(null, { error: e, service: 'process', severity: 'fatal', context: { kind: 'unhandledRejection' } });
});
process.on('uncaughtException', (e) => {
  void captureError(null, { error: e, service: 'process', severity: 'fatal', context: { kind: 'uncaughtException' } });
});

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
