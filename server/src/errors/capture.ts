// Persistent error capture.
//
// The problem: a thrown error used to exist only as a line in Render's log
// buffer. Nobody watches that buffer, nothing is running error monitoring, and
// a user reporting "it failed when I submitted" gave us nothing to search for.
// Errors were observed only by luck.
//
// This module makes every failure (a) redacted, (b) persisted, and (c)
// addressable by a short id that appears in three places at once: the log line,
// the stored record, and the response the user is looking at. A support message
// saying "error a3f9c2..." is then a primary key, not a guessing game.
//
// What it refuses to do:
//   • It never sends a stack trace, a SQL fragment, or a server filesystem path
//     to the client. 5xx always gets a generic sentence; 4xx only gets its own
//     message back after that message passes a safety check.
//   • It never throws. An error handler that can itself crash the request is
//     strictly worse than no error handler, so every step here is wrapped and
//     persistence runs in the background — a slow or dead database delays no
//     response.
//   • It never invents. If the error store cannot be read, recentErrors reports
//     that it is unavailable and returns null counts — never an empty list that
//     reads as "zero errors".
//
// Storage: records are written to the existing AgentRun entity with
// agent_name = 'system.error'. See ERROR_AGENT_NAME for why that entity.

import { randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * AgentRun is the store because it is the only existing entity that is both
 * admin-read-only (rls.read = role admin) and service-role-write-only
 * (PROTECTED_FIELDS.AgentRun = ['*']), which is exactly what an error log
 * needs: no user may read other people's failures, and no browser client may
 * forge a failure to poison System Health. Its column set also already matches
 * an error record (run_id, status, error, started_at, duration, a free-text
 * summary). AuditLog was rejected: its rls.create is `true`, so any client
 * could fabricate error rows, and its read rule exposes any row carrying the
 * reader's user_id back to that user.
 *
 * `agent_name` is the distinguisher. Everything written here carries exactly
 * this value, so error records are always separable from real agent runs.
 */
export const ERROR_AGENT_NAME = 'system.error';

/** Shape version of the JSON stored in AgentRun.output_summary. */
export const ERROR_SCHEMA_VERSION = 'error-capture/1';

/** What the client is told for anything we do not deliberately expose. */
export const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

export type Severity = 'fatal' | 'error' | 'warn';

export interface CaptureOptions {
  /** The thrown value. Anything: Error, string, object, null. */
  error: unknown;
  /** Which part of the system failed, e.g. 'api', 'scheduler', 'process'. */
  service?: string;
  /** Route or job name, e.g. 'POST /api/functions/winnerFinalize'. */
  route?: string | null;
  /** Correlation id from the caller, when one exists. Never invented. */
  requestId?: string | null;
  severity?: Severity;
  /** Extra detail. Redacted before it is stored — see REDACT. */
  context?: Record<string, unknown> | null;
  /** Who hit it, when known. */
  userId?: string | null;
  /** Supply an id when the caller has already shown it to the user. */
  id?: string;
  /** HTTP status, when the failure happened on a request. */
  status?: number | null;
}

// ── Redaction ────────────────────────────────────────────────────────────────
//
// This is the part that matters most. An error object habitually carries the
// thing that caused it, and the thing that caused it is very often a
// credential: a connection string in a driver message, an Authorization header
// on a failed request config, a payout account number in the row being written.
// Redaction runs before anything is logged, before anything is stored, and
// before any message is echoed back to a client.

const REDACTED = '[redacted]';

// Matched against the key with punctuation and case removed, so `API_KEY`,
// `apiKey` and `api-key` all normalise to `apikey`. Substring match, so
// `db_password_2` is caught too. Deliberately excludes bare 'auth' and bare
// 'key': `author_id` and `badge_key` are ordinary fields, not secrets.
const SENSITIVE_KEY_PARTS = [
  'password', 'passwd', 'passphrase',
  'secret', 'token', 'credential', 'authorization', 'bearer', 'cookie',
  'apikey', 'accesskey', 'privatekey', 'sessionid', 'signature',
  'databaseurl', 'connectionstring', 'dburl',
  // Payout and card details. `account_number` and `account_no` do not share a
  // substring once punctuation is stripped ('accountnumber' vs 'accountno'),
  // so both spellings are listed; same for the card pair.
  'accountnumber', 'accountno', 'cardnumber', 'cardno', 'bankaccount',
  'cvv', 'cvc', 'ifsc', 'upi', 'vpa', 'otp',
];

function isSensitiveKey(key: string): boolean {
  const flat = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!flat) return false;
  return SENSITIVE_KEY_PARTS.some((part) => flat.includes(part));
}

type ValueRule = [RegExp, string | ((...m: string[]) => string)];

// Order matters: the most specific shapes are replaced first so a later, looser
// rule cannot chew half of a string the specific rule would have taken whole.
const VALUE_RULES: ValueRule[] = [
  // A PEM block. Its body lines are short enough to slip under every
  // length-based rule below, so the markers are what is matched.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted-private-key]'],
  // Any URL carrying inline credentials — the whole URL goes, host included,
  // because the host of a production database is itself not public.
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@"'`]+:[^\s@"'`]+@[^\s"'`<>]+/gi, '[redacted-url]'],
  // A datastore URL even without credentials in it.
  [/\b(?:postgres(?:ql)?|mysql|mariadb|mssql|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^\s"'`<>]+/gi, '[redacted-connection-string]'],
  // JWTs (three base64url segments).
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, '[redacted-jwt]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]'],
  // HTTP Basic. The base64 payload decodes to `user:password` and is usually
  // far shorter than the generic blob rule's 40-character floor, so without
  // this rule a Basic credential survives redaction verbatim.
  [/\bBasic\s+[A-Za-z0-9+/=_-]{8,}/gi, 'Basic [redacted]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted-access-key]'],
  // Vendor-prefixed API keys: Stripe/OpenAI `sk_`/`rk_`, webhook `whsec_`,
  // GitHub `ghp_`, GitLab `glpat-`, Slack `xoxb-`, Shopify `shpat_`. These are
  // live credentials that are frequently under 40 characters and not hex, so
  // neither generic rule below would catch them.
  [/\b(?:sk|rk|pk|whsec|shpat|glpat|gh[opsur]|xox[abprs])[_-][A-Za-z0-9_-]{8,}/g, '[redacted-key]'],
  [/\bAIza[A-Za-z0-9_-]{20,}/g, '[redacted-key]'],
  // `password=hunter2`, `api_key: abc`, `DATABASE_URL=...` inside prose.
  // The key may carry a prefix or suffix (`client_secret`, `secret_key`,
  // `db_password_2`): a bare \b would fail on those, because an underscore is
  // a word character and so puts no boundary before the sensitive word.
  [
    /([A-Za-z0-9_.-]{0,32}(?:password|passwd|passphrase|secret|api[_-]?key|access[_-]?key|token|authorization|cookie|database[_-]?url|connection[_-]?string|upi[_-]?id|ifsc|account[_-]?number|otp)[A-Za-z0-9_.-]{0,32})\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;&)}\]]+)/gi,
    (_m: string, key: string) => `${key}=${REDACTED}`,
  ],
  // Long hex: hashes, raw keys, signatures.
  [/\b[0-9a-fA-F]{32,}\b/g, '[redacted-hex]'],
  // Long base64-ish blob. Requires an uppercase letter AND a digit so ordinary
  // long paths and identifiers are not mistaken for secrets.
  [/(?=[A-Za-z0-9+/_-]*[A-Z])(?=[A-Za-z0-9+/_-]*[0-9])\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '[redacted-blob]'],
];

const MAX_STRING = 4000;
const MAX_DEPTH = 5;
const MAX_KEYS = 60;
const MAX_ARRAY = 40;

function redactString(input: string): string {
  let out = input.length > MAX_STRING ? `${input.slice(0, MAX_STRING)}…` : input;
  for (const [re, replacement] of VALUE_RULES) {
    out = typeof replacement === 'string'
      ? out.replace(re, replacement)
      : out.replace(re, replacement as (substring: string, ...args: any[]) => string);
  }
  return out;
}

function redactErrorObject(err: Error, depth: number, seen: WeakSet<object>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: String(err.name || 'Error'),
    message: redactString(String(err.message ?? '')),
  };
  if (typeof err.stack === 'string') out.stack = redactString(err.stack);
  // name/message/stack are non-enumerable, so this picks up only the extras a
  // library hung on the error — which is exactly where an HTTP client parks the
  // request config, headers and body that caused the failure.
  for (const key of Object.keys(err).slice(0, MAX_KEYS)) {
    if (key in out) continue;
    out[key] = isSensitiveKey(key) ? REDACTED : REDACT((err as any)[key], depth + 1, seen);
  }
  if ((err as any).cause !== undefined && out.cause === undefined) {
    out.cause = REDACT((err as any).cause, depth + 1, seen);
  }
  return out;
}

/**
 * The redaction pass: returns a copy of `value` with every credential-shaped
 * key blanked and every credential-shaped value rewritten. Never throws — a
 * getter that explodes yields '[redaction-failed]' for that branch rather than
 * taking down the capture.
 */
export function REDACT(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  try {
    if (value === undefined || value === null) return null;

    const type = typeof value;
    if (type === 'string') return redactString(value as string);
    if (type === 'number' || type === 'boolean') return value;
    if (type === 'bigint') return String(value);
    if (type === 'function') return '[function]';
    if (type === 'symbol') return String(value);

    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) return redactErrorObject(value, depth, seen);
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return '[binary]';
    if (ArrayBuffer.isView(value as any)) return '[binary]';

    if (depth >= MAX_DEPTH) return '[truncated]';

    if (Array.isArray(value)) {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
      const items = value.slice(0, MAX_ARRAY).map((v) => REDACT(v, depth + 1, seen));
      if (value.length > MAX_ARRAY) items.push(`[+${value.length - MAX_ARRAY} more]`);
      return items;
    }

    if (type === 'object') {
      const obj = value as Record<string, unknown>;
      if (seen.has(obj)) return '[circular]';
      seen.add(obj);
      const out: Record<string, unknown> = {};
      let count = 0;
      for (const key of Object.keys(obj)) {
        if (count >= MAX_KEYS) { out['[truncated]'] = true; break; }
        count += 1;
        if (isSensitiveKey(key)) { out[key] = REDACTED; continue; }
        try {
          const v = obj[key];
          if (v === undefined) continue;
          out[key] = REDACT(v, depth + 1, seen);
        } catch {
          out[key] = '[redaction-failed]';
        }
      }
      return out;
    }

    return '[unserialisable]';
  } catch {
    return '[redaction-failed]';
  }
}

// ── Ids ──────────────────────────────────────────────────────────────────────

/**
 * Short, copy-able, case-insensitive. 12 hex chars is small enough that a user
 * can read it off a screen into a WhatsApp message and long enough that two
 * errors never collide in practice. Deliberately shorter than the 32-char
 * threshold of the hex redaction rule, so an error id is never redacted out of
 * its own log line.
 */
let idFallbackCounter = 0;

export function newErrorId(): string {
  try {
    return randomBytes(6).toString('hex');
  } catch {
    // randomBytes is the one call in this module that can throw (an exhausted
    // entropy source). An id that is merely very unlikely to collide beats an
    // error handler that dies while reporting an error, so this never rethrows.
    idFallbackCounter = (idFallbackCounter + 1) & 0xffff;
    const t = (Date.now() & 0xffffffff) >>> 0;
    return t.toString(16).padStart(8, '0') + idFallbackCounter.toString(16).padStart(4, '0');
  }
}

// ── Capture ──────────────────────────────────────────────────────────────────

interface ErrorRecord {
  error_id: string;
  severity: Severity;
  service: string;
  route: string | null;
  request_id: string | null;
  user_id: string | null;
  status: number | null;
  name: string;
  message: string;
  stack: string | null;
  context: unknown;
  captured_at: string;
}

function str(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  const s = redactString(String(value)).trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function describe(error: unknown): { name: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      name: String(error.name || 'Error'),
      message: redactString(String(error.message ?? '')).slice(0, 400) || 'Unknown error',
      stack: typeof error.stack === 'string' ? redactString(error.stack) : null,
    };
  }
  if (typeof error === 'string') {
    return { name: 'Error', message: redactString(error).slice(0, 400) || 'Unknown error', stack: null };
  }
  const asAny = error as any;
  const message = asAny && typeof asAny.message === 'string' ? asAny.message : safeJson(REDACT(error));
  return {
    name: String(asAny?.name || 'NonError'),
    message: redactString(String(message ?? '')).slice(0, 400) || 'Unknown error',
    stack: null,
  };
}

function safeJson(value: unknown, max = 6000): string {
  try {
    const s = JSON.stringify(value);
    if (typeof s !== 'string') return '{}';
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return '{}';
  }
}

/** Ceiling for the JSON stored in AgentRun.output_summary. */
const MAX_SUMMARY = 6000;

/**
 * Serialise the detail so the stored string is ALWAYS valid JSON.
 *
 * Truncating the finished JSON string (what safeJson does, which is fine for a
 * free-text message) produces a document JSON.parse rejects — and an
 * unparseable detail silently loses the severity, the route, the name and the
 * stack, i.e. everything the record exists for. A 4 KB stack plus a moderate
 * context clears 6000 characters easily, so this is a routine case, not an
 * exotic one. Oversize records therefore shed whole fields, largest-and-least-
 * valuable first, and record in `dropped` exactly what was shed — never a
 * half-written document, never a silent loss.
 */
function fitDetail(r: ErrorRecord): string {
  const base: Record<string, unknown> = { kind: 'error', schema: ERROR_SCHEMA_VERSION, ...r };
  const attempts: Array<Record<string, unknown>> = [
    base,
    { ...base, context: null, dropped: ['context'] },
    { ...base, context: null, stack: null, dropped: ['context', 'stack'] },
    { ...base, context: null, stack: null, message: r.message.slice(0, 200), dropped: ['context', 'stack', 'message'] },
  ];
  for (const attempt of attempts) {
    try {
      const s = JSON.stringify(attempt);
      if (typeof s === 'string' && s.length <= MAX_SUMMARY) return s;
    } catch {
      // Try the next, smaller shape.
    }
  }
  // Last resort: the identity of the error, which is what makes it findable.
  return JSON.stringify({
    kind: 'error',
    schema: ERROR_SCHEMA_VERSION,
    error_id: r.error_id,
    severity: r.severity,
    service: r.service,
    captured_at: r.captured_at,
    dropped: ['everything-but-identity'],
  });
}

function buildRecord(id: string, opts: CaptureOptions): ErrorRecord {
  const { name, message, stack } = describe(opts?.error);
  return {
    error_id: id,
    severity: (opts?.severity as Severity) || 'error',
    service: str(opts?.service, 60) || 'unknown',
    route: str(opts?.route, 200),
    request_id: str(opts?.requestId, 120),
    user_id: str(opts?.userId, 64),
    status: Number.isInteger(opts?.status as number) ? (opts!.status as number) : null,
    name,
    message,
    // Stored, never returned to a client: AgentRun is admin-read-only, and a
    // stack is the whole reason a captured error is debuggable at all.
    stack: stack ? stack.slice(0, MAX_STRING) : null,
    context: opts?.context ? REDACT(opts.context) : null,
    captured_at: new Date().toISOString(),
  };
}

// Resolved lazily so importing this module never constructs a database client.
// The middleware and the process-level handlers can then be installed before
// (or without) a working database.
let svcPromise: Promise<any> | null = null;
async function defaultSvc(): Promise<any | null> {
  try {
    if (!svcPromise) {
      svcPromise = import('../entities/service.js')
        .then((m) => m.serviceClient())
        .catch((e) => { svcPromise = null; throw e; });
    }
    return await svcPromise;
  } catch {
    return null;
  }
}

/**
 * Persist one error and return the id that identifies it everywhere: the log
 * line, the stored record, and (via errorMiddleware) the client response.
 *
 * Never throws and never rejects. If the store is unreachable the id is still
 * returned and the redacted error still reaches the log, so a failure to record
 * an error degrades observability instead of breaking the request.
 *
 * Pass `null` for `svc` to use the service-role client (resolved lazily).
 */
export async function captureError(svc: any, opts: CaptureOptions): Promise<string> {
  const id = (typeof opts?.id === 'string' && opts.id) || newErrorId();
  let record: ErrorRecord | null = null;
  try {
    record = buildRecord(id, opts);
    // The only log line for this failure. It carries the redacted message, not
    // the raw error, because logs leave the box.
    console.error(
      `[error ${id}]`,
      `${record.severity} ${record.service}`,
      record.route || '-',
      `${record.name}: ${record.message}`
    );
  } catch {
    console.error(`[error ${id}] could not describe the error`);
  }

  try {
    const client = svc || (await defaultSvc());
    const AgentRun = client?.entities?.AgentRun;
    if (!AgentRun || typeof AgentRun.create !== 'function') {
      console.error(`[error ${id}] not persisted: no entity client`);
      return id;
    }
    const r = record || buildRecord(id, { error: opts?.error });
    await AgentRun.create({
      agent_name: ERROR_AGENT_NAME,
      agent_version: ERROR_SCHEMA_VERSION,
      run_id: id,
      status: 'failed',
      // AgentRun.provider is the free-text origin column; the emitting service
      // goes there so System Health can group without parsing the summary.
      provider: r.service,
      triggered_by: r.user_id,
      input_ref: r.request_id,
      started_at: r.captured_at,
      completed_at: r.captured_at,
      error: r.message,
      output_summary: fitDetail(r),
    });
  } catch (persistFailure) {
    // Losing the record is bad; losing the request because we could not write
    // the record would be worse.
    const why = persistFailure instanceof Error ? persistFailure.message : String(persistFailure);
    console.error(`[error ${id}] not persisted:`, redactString(String(why)).slice(0, 200));
  }
  return id;
}

// ── Express middleware ───────────────────────────────────────────────────────

function statusOf(err: any): number {
  const raw = err?.status ?? err?.statusCode;
  return Number.isInteger(raw) && raw >= 400 && raw <= 599 ? Number(raw) : 500;
}

function routeOf(req: any): string | null {
  try {
    const method = String(req?.method || '').toUpperCase();
    // Query strings are dropped, never logged: they are where tokens ride.
    const path = String(req?.originalUrl || req?.url || req?.path || '').split('?')[0];
    if (!path) return method || null;
    return `${method} ${path}`.trim().slice(0, 200);
  } catch {
    return null;
  }
}

function requestIdOf(req: any): string | null {
  try {
    const h = req?.headers || {};
    const raw = h['x-request-id'] || h['x-correlation-id'] || h['x-render-request-id'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    // Not invented: absent means null, and the error id is the correlation
    // handle in that case.
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
  } catch {
    return null;
  }
}

// Shapes that mean "this sentence is describing our internals": stack frames,
// server paths, driver internals, SQL. A 4xx message matching any of them is
// replaced by the generic sentence rather than shown.
const UNSAFE_MESSAGE = new RegExp(
  [
    '\\bat\\s+[\\w$.<>]+\\s*\\(',            // stack frame
    '(?:^|[\\s"\'(])\\/(?:home|var|usr|srv|opt|app|root|Users|etc)\\/', // posix server path
    '[A-Za-z]:\\\\',                          // windows path
    'node_modules',
    '\\.(?:ts|js|mjs|cjs|json):\\d+',         // file:line
    '\\bprisma\\b|\\bpostgres\\b|\\bpg_[a-z]+\\b|\\bsqlstate\\b',
    '\\bselect\\b[\\s\\S]*\\bfrom\\b',
    '\\binsert\\s+into\\b|\\bdelete\\s+from\\b|\\bupdate\\b[\\s\\S]*\\bset\\b',
    '\\brelation\\s+"|\\bcolumn\\s+"|\\bconstraint\\s+"',
    '\\bECONNREFUSED\\b|\\bENOTFOUND\\b|\\bEAI_AGAIN\\b|\\bETIMEDOUT\\b',
  ].join('|'),
  'i'
);

/**
 * Only a deliberate 4xx message survives to the client, and only if it says
 * nothing about our internals. Everything else becomes GENERIC_MESSAGE.
 */
function clientSafeMessage(err: any, status: number): string {
  try {
    if (status >= 500) return GENERIC_MESSAGE;
    const raw = typeof err?.message === 'string' ? err.message.trim() : '';
    if (!raw || raw.length > 200) return GENERIC_MESSAGE;
    if (/[\r\n]/.test(raw)) return GENERIC_MESSAGE; // multi-line means a stack came along
    if (UNSAFE_MESSAGE.test(raw)) return GENERIC_MESSAGE;
    // If redaction changed anything, the message carried a credential. Do not
    // hand back a partially-scrubbed sentence — hand back nothing.
    if (redactString(raw) !== raw) return GENERIC_MESSAGE;
    return raw;
  } catch {
    return GENERIC_MESSAGE;
  }
}

export interface ErrorMiddlewareOptions {
  /** Origin label stored on every record from this handler. */
  service?: string;
  /** Entity client, or a factory for one. Tests inject a fake here. */
  svc?: any | (() => any);
}

/**
 * The Express error handler. Responds first, persists after: the client never
 * waits on the error store, and a dead store cannot turn a 500 into a hang.
 */
export function errorMiddleware(options: ErrorMiddlewareOptions = {}) {
  const service = options.service || 'api';

  return function razekitErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    const id = newErrorId();
    try {
      // Something already started writing the response; Express's default
      // handler is the only thing that can close it correctly.
      if (res.headersSent) return next(err);

      const status = statusOf(err);
      let svc: any = null;
      try {
        svc = typeof options.svc === 'function' ? options.svc() : (options.svc ?? null);
      } catch {
        svc = null;
      }

      // Fire-and-forget: captureError never rejects, so this cannot become an
      // unhandled rejection, and the response below is not delayed by the DB.
      void captureError(svc, {
        id,
        error: err,
        service,
        route: routeOf(req),
        requestId: requestIdOf(req),
        severity: status >= 500 ? 'error' : 'warn',
        userId: (req as any)?.user?.id ?? null,
        status,
        context: { method: (req as any)?.method ?? null, status },
      });

      // The only two things a client ever gets: a generic-or-vetted sentence
      // and the id to quote at support.
      res.status(status).json({ error: clientSafeMessage(err, status), error_id: id });
    } catch (handlerFailure) {
      try {
        console.error(`[error ${id}] the error handler itself failed:`, handlerFailure);
      } catch { /* logging must not be the thing that throws */ }
      try {
        if (!res.headersSent) res.status(500).json({ error: GENERIC_MESSAGE, error_id: id });
      } catch { /* the socket is gone; nothing left to do */ }
    }
  };
}

// ── Read side (admin System Health) ──────────────────────────────────────────

export interface RecentErrorsOptions {
  limit?: number;
  severity?: Severity | Severity[];
  service?: string;
  /** ISO date or Date; only errors captured at or after this are returned. */
  since?: string | Date;
  /** Stacks are omitted by default even for admins. */
  includeStack?: boolean;
}

export interface RecentError {
  id: string | null;
  error_id: string | null;
  at: string | null;
  severity: string | null;
  service: string | null;
  route: string | null;
  request_id: string | null;
  user_id: string | null;
  status: number | null;
  name: string | null;
  message: string | null;
  context: unknown;
  /**
   * False when the stored detail could not be read, so the nulls above mean
   * "unknown", not "none". Without this an unreadable record is indistinguish-
   * able from one that genuinely had no severity or route.
   */
  detail_ok: boolean;
  stack?: string | null;
}

export interface RecentErrorsResult {
  ok: boolean;
  errors: RecentError[];
  /** How many rows this call returned. null when the store could not be read. */
  returned: number | null;
  /** Never measured: the store exposes no count. Rendered as "Not measured". */
  total: null;
  /** True when the read window filled up, so older matches may exist. */
  window_full: boolean;
  reason?: string;
}

function parseDetail(row: any): { ok: boolean; detail: Record<string, any> } {
  try {
    const raw = row?.output_summary;
    if (typeof raw !== 'string' || !raw) return { ok: false, detail: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return { ok: true, detail: parsed };
    return { ok: false, detail: {} };
  } catch {
    return { ok: false, detail: {} };
  }
}

function toRecentError(row: any, includeStack: boolean): RecentError {
  const { ok, detail: d } = parseDetail(row);
  const out: RecentError = {
    id: row?.id ?? null,
    error_id: row?.run_id ?? d.error_id ?? null,
    at: d.captured_at ?? row?.completed_at ?? row?.started_at ?? row?.created_date ?? null,
    severity: d.severity ?? null,
    service: d.service ?? row?.provider ?? null,
    route: d.route ?? null,
    request_id: row?.input_ref ?? d.request_id ?? null,
    user_id: row?.triggered_by ?? d.user_id ?? null,
    status: Number.isInteger(d.status) ? d.status : null,
    name: d.name ?? null,
    message: row?.error ?? d.message ?? null,
    context: d.context ?? null,
    // The whole point of this flag: when the stored detail could not be parsed,
    // every field above is null because it is UNKNOWN, not because the error
    // genuinely had no route or severity. An admin reading the System Health
    // page has to be able to tell those two apart.
    detail_ok: ok,
  };
  if (includeStack) out.stack = d.stack ?? null;
  return out;
}

/**
 * Recent captured errors, newest first, for the admin System Health page.
 *
 * Returns `ok: false` with `returned: null` when the store cannot be read —
 * an empty list would otherwise be indistinguishable from "no errors", which
 * is the exact lie this module exists to prevent.
 */
export async function recentErrors(svc: any, opts: RecentErrorsOptions = {}): Promise<RecentErrorsResult> {
  const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 200);
  const severities = opts?.severity
    ? (Array.isArray(opts.severity) ? opts.severity : [opts.severity]).map(String)
    : null;
  const sinceMs = opts?.since ? new Date(opts.since).getTime() : NaN;
  const postFiltered = Boolean(severities) || Number.isFinite(sinceMs);
  // Severity and `since` are not stored as columns, so they are filtered after
  // the read; over-fetch so the page is not short-changed by the filter.
  const windowSize = postFiltered ? Math.min(limit * 5, 500) : limit;

  try {
    const client = svc || (await defaultSvc());
    const AgentRun = client?.entities?.AgentRun;
    if (!AgentRun || typeof AgentRun.filter !== 'function') {
      return { ok: false, errors: [], returned: null, total: null, window_full: false, reason: 'error store unavailable' };
    }

    const query: Record<string, unknown> = { agent_name: ERROR_AGENT_NAME };
    if (opts?.service) query.provider = String(opts.service);

    const rows = await AgentRun.filter(query, '-created_date', windowSize);
    const list = Array.isArray(rows) ? rows : [];
    let mapped = list.map((row: any) => toRecentError(row, Boolean(opts?.includeStack)));

    if (severities) mapped = mapped.filter((e) => e.severity !== null && severities.includes(e.severity));
    if (Number.isFinite(sinceMs)) {
      mapped = mapped.filter((e) => {
        const t = e.at ? new Date(e.at).getTime() : NaN;
        return Number.isFinite(t) && t >= sinceMs;
      });
    }

    const errors = mapped.slice(0, limit);
    return {
      ok: true,
      errors,
      returned: errors.length,
      total: null,
      window_full: list.length >= windowSize,
    };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      errors: [],
      returned: null,
      total: null,
      window_full: false,
      reason: redactString(String(why)).slice(0, 200) || 'error store unavailable',
    };
  }
}
