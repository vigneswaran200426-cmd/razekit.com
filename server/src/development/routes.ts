// The RazeKit Development area.
//
// This is one product area inside the RazeKit application — a sibling of the
// contest, brand and creator areas, not a second product. It shares RazeKit's
// account, session and permission model; what it does NOT share is domain
// logic, which lives entirely in the RazeKit DEV engine behind this router.
//
// Everything here is a thin, authenticated, tenant-scoping proxy. There is
// deliberately no task state in RazeKit's own database: two stores for one task
// is two truths for one task.
import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { callDevEngine, DevEngineError, developmentConfigured } from './client.js';

export const developmentRouter = Router();

// Every route below is for a signed-in RazeKit account. The engine re-checks
// tenancy on its side from the signed principal, so this is the first of two
// independent checks rather than the only one.
developmentRouter.use(requireAuth);

function fail(res: import('express').Response, e: unknown) {
  if (e instanceof DevEngineError) return res.status(e.status).json({ error: e.message });
  throw e;
}

/** Whether this deployment has the Development area switched on. */
developmentRouter.get('/status', (_req, res) => {
  res.json({ configured: developmentConfigured() });
});

/** Pre-flight: complexity, predicted tools, estimated budget. Creates nothing. */
developmentRouter.post('/tasks/analyze', async (req, res) => {
  try {
    res.json(
      await callDevEngine({
        method: 'POST',
        path: '/api/tasks/analyze',
        user: req.user!,
        body: req.body,
      })
    );
  } catch (e) {
    fail(res, e);
  }
});

developmentRouter.get('/tasks', async (req, res) => {
  try {
    res.json(await callDevEngine({ method: 'GET', path: '/api/tasks', user: req.user! }));
  } catch (e) {
    fail(res, e);
  }
});

developmentRouter.post('/tasks', async (req, res) => {
  try {
    // taskType decides the agent, and the agent decides the entire execution
    // path: app/website → Niomi, game → Konami. The engine owns that routing;
    // RazeKit forwards the type and never picks an agent itself, so the two
    // pipelines cannot be crossed from this side.
    const task = await callDevEngine({
      method: 'POST',
      path: '/api/tasks',
      user: req.user!,
      body: req.body,
    });
    res.status(201).json(task);
  } catch (e) {
    fail(res, e);
  }
});

developmentRouter.get('/tasks/:id', async (req, res) => {
  try {
    res.json(await callDevEngine({ method: 'GET', path: `/api/tasks/${req.params.id}`, user: req.user! }));
  } catch (e) {
    fail(res, e);
  }
});

developmentRouter.patch('/tasks/:id', async (req, res) => {
  try {
    res.json(
      await callDevEngine({
        method: 'PATCH',
        path: `/api/tasks/${req.params.id}`,
        user: req.user!,
        body: req.body,
      })
    );
  } catch (e) {
    fail(res, e);
  }
});

/** The Control Center projection: status, progress, budget, deliverables, chat. */
developmentRouter.get('/tasks/:id/dashboard', async (req, res) => {
  try {
    res.json(
      await callDevEngine({ method: 'GET', path: `/api/tasks/${req.params.id}/dashboard`, user: req.user! })
    );
  } catch (e) {
    fail(res, e);
  }
});

developmentRouter.get('/tasks/:id/events', async (req, res) => {
  try {
    res.json(await callDevEngine({ method: 'GET', path: `/api/tasks/${req.params.id}/events`, user: req.user! }));
  } catch (e) {
    fail(res, e);
  }
});

developmentRouter.get('/tasks/:id/acceptance', async (req, res) => {
  try {
    res.json(
      await callDevEngine({ method: 'GET', path: `/api/tasks/${req.params.id}/acceptance`, user: req.user! })
    );
  } catch (e) {
    fail(res, e);
  }
});

/**
 * A change the user asks for while the task is running.
 *
 * The engine classifies it: an in-scope refinement ("make the hero dark blue")
 * is applied immediately, while something that crosses a boundary ("add Stripe
 * payments") comes back as a decision for the user to approve. RazeKit does not
 * second-guess that classification — one classifier, one behaviour.
 */
developmentRouter.post('/tasks/:id/commands', async (req, res) => {
  try {
    res.json(
      await callDevEngine({
        method: 'POST',
        path: `/api/tasks/${req.params.id}/commands`,
        user: req.user!,
        body: req.body,
      })
    );
  } catch (e) {
    fail(res, e);
  }
});

developmentRouter.post('/tasks/:id/changes/:changeId/approve', async (req, res) => {
  try {
    res.json(
      await callDevEngine({
        method: 'POST',
        path: `/api/tasks/${req.params.id}/changes/${req.params.changeId}/approve`,
        user: req.user!,
        body: req.body,
      })
    );
  } catch (e) {
    fail(res, e);
  }
});

developmentRouter.post('/tasks/:id/changes/:changeId/deny', async (req, res) => {
  try {
    res.json(
      await callDevEngine({
        method: 'POST',
        path: `/api/tasks/${req.params.id}/changes/${req.params.changeId}/deny`,
        user: req.user!,
        body: req.body,
      })
    );
  } catch (e) {
    fail(res, e);
  }
});

developmentRouter.post('/tasks/:id/cancel', async (req, res) => {
  try {
    res.json(
      await callDevEngine({ method: 'POST', path: `/api/tasks/${req.params.id}/cancel`, user: req.user! })
    );
  } catch (e) {
    fail(res, e);
  }
});
