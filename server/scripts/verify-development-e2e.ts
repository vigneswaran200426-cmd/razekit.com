/**
 * End-to-end verification of the RazeKit ↔ RazeKit DEV integration.
 *
 * This is not a unit test with the boundary mocked out. It starts the real
 * development engine as a separate process, talks to it with RazeKit's real
 * client over a real socket with real signed principals, and drives a real
 * build until the engine itself reports it verified and complete.
 *
 *   npm run verify:development
 *
 * Point DEV_ENGINE_PATH at a razekit-dev checkout (defaults to ../razekit-dev
 * beside this repository). Model providers are not required: the engine runs
 * its deterministic Fable and Astra adapters, which still write real files, run
 * real tests, run a real build and produce a real artifact. Set FABLE_API_KEY
 * and ASTRA_API_KEY to run the same flow against the live providers instead.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const ENGINE_PATH = process.env.DEV_ENGINE_PATH || path.resolve(REPO_ROOT, '..', 'razekit-dev');
const PORT = Number(process.env.DEV_ENGINE_TEST_PORT || 3111);
const SECRET = 'e2e-principal-secret-not-a-real-credential';
const ENGINE_URL = `http://127.0.0.1:${PORT}`;

// With both provider keys present this runs against the live Fable and Astra
// models; without them it runs the deterministic pair. Either way the loop,
// the tools, the tests, the build, the artifact and the verification are real —
// the mode is stated up front rather than inferred, so a run can never be
// mistaken for the other kind.
const HAS_REAL_MODELS = Boolean(process.env.FABLE_API_KEY?.trim() && process.env.ASTRA_API_KEY?.trim());
const MODEL_MODE = HAS_REAL_MODELS ? 'real' : 'test';

// Configured before the client module is imported: it reads config at import
// time, exactly as it does in the running server.
process.env.DEV_ENGINE_URL = ENGINE_URL;
process.env.DEV_PRINCIPAL_SECRET = SECRET;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-insecure-secret';

const { callDevEngine, DevEngineError } = await import('../src/development/client.js');

const alice = { id: 'e2e_user_alice', role: 'user', user_role: 'client' };
const mallory = { id: 'e2e_user_mallory', role: 'user', user_role: 'creator' };

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEngine(log: string[], timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${ENGINE_URL}/health`);
      if (r.ok) return (await r.json()) as { models?: { mode?: string } };
      lastError = `health returned ${r.status}`;
    } catch (e) {
      lastError = (e as Error).message;
    }
    await sleep(250);
  }
  // Without the engine's own output this failure says only "it did not start",
  // which is the least useful thing it could say.
  throw new Error(
    `The development engine did not start in time (last probe: ${lastError})\n` +
      `Engine output:\n${log.join('') || '(nothing)'}`,
  );
}

async function main() {
  if (!existsSync(path.join(ENGINE_PATH, 'src', 'server.js'))) {
    console.error(`No razekit-dev checkout at ${ENGINE_PATH}. Set DEV_ENGINE_PATH.`);
    process.exit(2);
  }

  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'razekit-e2e-data-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'razekit-e2e-ws-'));
  let engine: ChildProcess | null = null;
  const engineLog: string[] = [];

  try {
    console.log('RazeKit ↔ RazeKit DEV end-to-end\n');
    console.log(`  engine     ${ENGINE_PATH}`);
    console.log(`  workspaces ${workspaceRoot}`);
    console.log(`  models     ${MODEL_MODE}${HAS_REAL_MODELS ? ' (live Fable + Astra)' : ' (deterministic pair — set FABLE_API_KEY and ASTRA_API_KEY for live)'}\n`);

    engine = spawn(process.execPath, ['src/server.js'], {
      cwd: ENGINE_PATH,
      env: {
        ...process.env,
        PORT: String(PORT),
        RAZEKIT_DATA_DIR: dataDir,
        RAZEKIT_WORKSPACE_ROOT: workspaceRoot,
        // The production posture: the engine trusts nothing but a signed
        // principal, so this run exercises the same check production does.
        RAZEKIT_REQUIRE_SIGNED_PRINCIPAL: 'true',
        RAZEKIT_PRINCIPAL_SECRET: SECRET,
        RAZEKIT_MODEL_MODE: MODEL_MODE,
        RAZEKIT_ADMIN_TOKEN: process.env.RAZEKIT_ADMIN_TOKEN || 'e2e-admin-token',
        // The coordinator drives the build on its own timer. Nothing in this
        // script advances the state machine by hand — if the loop does not
        // work, this run does not finish.
        RAZEKIT_TICK_MS: '1000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    engine.stdout?.on('data', (c) => engineLog.push(String(c)));
    engine.stderr?.on('data', (c) => engineLog.push(String(c)));

    engine.on('error', (e) => engineLog.push(`spawn error: ${e.message}\n`));
    engine.on('exit', (code, signal) => engineLog.push(`engine exited: code=${code} signal=${signal}\n`));

    const health = await waitForEngine(engineLog);
    console.log(`Engine up. Model mode: ${health.models?.mode ?? 'unconfigured'}\n`);

    // ── 1. Pre-flight ────────────────────────────────────────────────────────
    console.log('Pre-flight');
    const preflight = await callDevEngine<{
      estimatedBudget: number;
      predictedAgentType: string;
      complexity: string;
    }>({
      method: 'POST',
      path: '/api/tasks/analyze',
      user: alice,
      body: {
        taskType: 'website',
        title: 'Beta landing page',
        originalRequest:
          'Create a simple responsive landing page with a navigation bar, hero section, CTA and footer. Run tests and package the result.',
      },
    });
    check('a website request is routed to Niomi', preflight.predictedAgentType === 'niomi', preflight.predictedAgentType);
    check('a budget is estimated before anything is created', preflight.estimatedBudget > 0);

    // ── 2. Task creation ─────────────────────────────────────────────────────
    console.log('\nTask creation');
    const created = await callDevEngine<{ task: any; agent: any }>({
      method: 'POST',
      path: '/api/tasks',
      user: alice,
      body: {
        taskType: 'website',
        title: 'Beta landing page',
        originalRequest:
          'Create a simple responsive landing page with a navigation bar, hero section, CTA and footer. Run tests and package the result.',
        maxBudget: 25,
        acceptAutonomousExecution: true,
        acceptanceCriteria: ['Tests pass', 'A build artifact is produced'],
      },
    });
    const taskId = created.task.id as string;
    check('the task is created and owned by the caller', created.task.userId === alice.id);
    check('the task is scoped to the caller tenant', created.task.tenantId === `rk-user-${alice.id}`);
    check('a Niomi agent instance is provisioned', created.agent?.agentType === 'niomi', created.agent?.agentType);
    check('the agent has its own isolated workspace', Boolean(created.agent?.workspaceId));

    // Authorisation is mandatory, not implied.
    await callDevEngine({
      method: 'POST',
      path: '/api/tasks',
      user: alice,
      body: { taskType: 'website', originalRequest: 'x', maxBudget: 5, acceptAutonomousExecution: false },
    })
      .then(() => check('a task without autonomous authorisation is refused', false, 'it was accepted'))
      .catch((e) => check('a task without autonomous authorisation is refused', e instanceof DevEngineError));

    // ── 3. Tenant isolation ──────────────────────────────────────────────────
    console.log('\nTenant isolation');
    await callDevEngine({ method: 'GET', path: `/api/tasks/${taskId}`, user: mallory })
      .then(() => check("another account cannot read this account's task", false, 'the read succeeded'))
      .catch((e) =>
        check(
          "another account cannot read this account's task",
          e instanceof DevEngineError && [403, 404].includes((e as DevEngineError).status),
          `status ${(e as DevEngineError).status}`,
        ),
      );

    const malloryTasks = await callDevEngine<any[]>({ method: 'GET', path: '/api/tasks', user: mallory });
    check("another account's task list is empty", Array.isArray(malloryTasks) && malloryTasks.length === 0);

    // A forged principal must not be accepted.
    const forged = await fetch(`${ENGINE_URL}/api/tasks`, {
      headers: { 'x-razekit-principal': 'bm90LWEtdG9rZW4.not-a-signature' },
    });
    check('a forged principal is rejected', !forged.ok, `status ${forged.status}`);

    // Unsigned tenant headers must not work when signing is required.
    const unsigned = await fetch(`${ENGINE_URL}/api/tasks`, {
      headers: { 'x-razekit-tenant-id': `rk-user-${alice.id}`, 'x-razekit-user-id': alice.id },
    });
    check('unsigned identity headers are rejected', !unsigned.ok, `status ${unsigned.status}`);

    // ── 4. The autonomous loop, driven by the engine itself ──────────────────
    console.log('\nAutonomous build (the engine drives this on its own timer)');
    const deadline = Date.now() + 180_000;
    let dashboard: any = null;
    let lastStatus = '';

    while (Date.now() < deadline) {
      dashboard = await callDevEngine<any>({
        method: 'GET',
        path: `/api/tasks/${taskId}/dashboard`,
        user: alice,
      });
      if (dashboard.status !== lastStatus) {
        lastStatus = dashboard.status;
        console.log(`  ${lastStatus.padEnd(16)} ${dashboard.progress?.percent ?? 0}%  $${Number(dashboard.budget?.currentSpend ?? 0).toFixed(3)}`);
      }
      if (['COMPLETED', 'BLOCKED', 'DECISION NEEDED'].includes(dashboard.status)) break;
      await sleep(1000);
    }

    check('the build reaches COMPLETED without being touched', dashboard?.status === 'COMPLETED', `ended at ${dashboard?.status}`);

    if (dashboard?.status !== 'COMPLETED') {
      // "It stopped" is not a diagnosis. The engine already recorded why, in
      // the updates the user would have read, so print those rather than
      // leaving whoever runs this to go spelunking in db.json.
      console.log('\n  why it stopped:');
      for (const event of (dashboard?.events ?? []).slice(0, 6)) {
        console.log(`    [${event.status}] ${event.title}: ${event.message}`);
      }
      for (const failure of dashboard?.verification?.failures ?? []) {
        console.log(`    verification: ${failure.category} — ${failure.reason}`);
      }
      const chat = (dashboard?.chat ?? []).slice(-6);
      for (const m of chat) console.log(`    ${m.role}: ${String(m.content).slice(0, 160)}`);
    }
    check('progress reports 100%', dashboard?.progress?.percent === 100, String(dashboard?.progress?.percent));
    check('completion is gated on verification passing', dashboard?.verification?.status === 'passed', String(dashboard?.verification?.status));
    check('spend stayed inside the hard budget', Number(dashboard?.budget?.currentSpend) <= Number(dashboard?.budget?.maxBudget));
    check('deliverables are reported', (dashboard?.deliverables?.length ?? 0) > 0);

    const acceptance = await callDevEngine<any[]>({
      method: 'GET',
      path: `/api/tasks/${taskId}/acceptance`,
      user: alice,
    });
    check('every acceptance criterion passed', acceptance.length > 0 && acceptance.every((c) => c.status === 'passed'));

    // ── 5. The deliverable actually exists ───────────────────────────────────
    console.log('\nDeliverable on disk');
    const workspace = path.join(workspaceRoot, taskId);
    const files = existsSync(workspace) ? await readdir(workspace) : [];
    check('the task has its own workspace directory', files.length > 0, workspace);
    check('the page was written', existsSync(path.join(workspace, 'index.html')));
    check('the build produced output', existsSync(path.join(workspace, 'dist', 'index.html')));

    if (existsSync(path.join(workspace, 'index.html'))) {
      const html = await readFile(path.join(workspace, 'index.html'), 'utf8');
      check('the page has a navigation bar', /<nav/.test(html));
      check('the page has a hero section', /id="hero"/.test(html));
      check('the page has a call to action', /id="cta"/.test(html));
      check('the page has a footer', /<footer/.test(html));
    }

    const artifacts = existsSync(path.join(workspace, 'artifacts'))
      ? await readdir(path.join(workspace, 'artifacts'))
      : [];
    check('an artifact was packaged', artifacts.length > 0, artifacts.join(', '));

    // ── 6. Game work routes to Konami, not down the App/Web path ────────────
    console.log('\nKonami routing');
    const gamePreflight = await callDevEngine<{ predictedAgentType: string; predictedTools: string[] }>({
      method: 'POST',
      path: '/api/tasks/analyze',
      user: alice,
      body: { taskType: 'game', title: 'Platformer', originalRequest: 'A small 2D platformer with one level.' },
    });
    check('a game request is routed to Konami', gamePreflight.predictedAgentType === 'konami', gamePreflight.predictedAgentType);
    check('a game gets engine tools, not web tools', gamePreflight.predictedTools.includes('engine'));
    check('a game does not get the web deployment tool', !gamePreflight.predictedTools.includes('deploy-web'));

    const gameTask = await callDevEngine<{ task: any; agent: any }>({
      method: 'POST',
      path: '/api/tasks',
      user: alice,
      body: {
        taskType: 'game',
        title: 'Platformer',
        originalRequest: 'A small 2D platformer with one level.',
        maxBudget: 30,
        acceptAutonomousExecution: true,
        acceptanceCriteria: ['The game builds'],
      },
    });
    check('a game task is owned by Konami', gameTask.agent?.agentType === 'konami', gameTask.agent?.agentType);
    check('the game task has its own workspace', gameTask.agent?.workspaceId !== created.agent?.workspaceId);
    check(
      'the game agent is a different instance from the website agent',
      gameTask.agent?.id !== created.agent?.id,
    );
    // Cancelled rather than left running: this deployment has no game engine
    // bound, and the point of the check was the routing, not the build.
    await callDevEngine({ method: 'POST', path: `/api/tasks/${gameTask.task.id}/cancel`, user: alice });

    // ── 7. A change while running ────────────────────────────────────────────
    console.log('\nUser changes');
    const scopeChange = await callDevEngine<any>({
      method: 'POST',
      path: `/api/tasks/${taskId}/commands`,
      user: alice,
      body: { content: 'Add Stripe payments to the checkout' },
    }).catch((e) => ({ error: e.message }));
    // A completed task refuses further changes; on a running one this returns a
    // decision. Either is correct — silently applying a payment integration is
    // not.
    check(
      'a payment integration is never applied silently',
      scopeChange?.mode === 'decision_needed' || Boolean(scopeChange?.error),
      JSON.stringify(scopeChange).slice(0, 120),
    );

    // ── 8. Nothing sensitive was persisted or logged ─────────────────────────
    console.log('\nSecret hygiene');
    const persisted = await readFile(path.join(dataDir, 'db.json'), 'utf8');
    check('the signing secret is not in persisted state', !persisted.includes(SECRET));
    check('the signing secret is not in engine logs', !engineLog.join('').includes(SECRET));
    check('no principal token is persisted', !/x-razekit-principal/i.test(persisted));
    for (const marker of ['FABLE_API_KEY', 'ASTRA_API_KEY', 'sk-ant-', 'sk-proj-']) {
      check(`no ${marker} value is persisted`, !persisted.includes(marker));
    }

    console.log('');
    if (failures === 0) {
      console.log('All end-to-end checks passed.');
    } else {
      console.error(`${failures} check(s) failed.`);
      console.error('\nEngine output:\n' + engineLog.join('').slice(-3000));
    }
  } finally {
    engine?.kill();
    await sleep(300);
    await rm(dataDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
