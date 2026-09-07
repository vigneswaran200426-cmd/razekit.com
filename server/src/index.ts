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
import { webhooksRouter } from './webhooks/routes.js';
import { miscRouter } from './misc/routes.js';
import { startScheduler } from './scheduler.js';

const app = express();

app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin/no-origin (curl, server-to-server) and configured web origins.
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(cookieParser());

// Webhooks need the RAW body → mount BEFORE express.json().
app.use('/api/webhooks', webhooksRouter);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Identify the caller (never rejects; anonymous → req.user = null).
app.use(attachUser);

// Local file serving (STORAGE_DRIVER=local).
app.use('/files', filesRouter);

// API surface (replaces the Base44 SDK).
app.use('/api/auth', authRouter);
app.use('/api/entities', entitiesRouter);
app.use('/api/functions', functionsRouter);
app.use('/api/integrations/core', integrationsRouter);
app.use('/api', miscRouter);

app.get('/', (_req, res) => res.json({ service: 'razekit-api', ok: true }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler — turns any thrown/rejected error into a clean JSON
// response instead of a 502. Surfaces the message so misconfig (e.g. a missing
// DATABASE_URL) is diagnosable from the API response.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err?.message || 'Internal error' });
});

// Never let a stray rejection take the process down (Render would 502 all routes).
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

app.listen(config.port, () => {
  console.log(`\n🚀 RazeKit API on http://localhost:${config.port}  (env: ${config.env})`);
  console.log(`   CORS origins: ${config.corsOrigins.join(', ')}`);
  startScheduler();
});
