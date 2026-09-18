// The contract every social platform adapter implements.
//
// The whole point of this layer is that RazeKit never has to guess. A platform
// either returns a number for a metric, or it tells us why it did not — and
// "did not" is never rendered as zero. Three distinct absences exist and they
// mean different things to a brand looking at a campaign:
//
//   unsupported  — this API has no such metric. It will never arrive.
//   unauthorized — the account has not granted the scope, or the tier does not
//                  include it. It could arrive if the creator reconnects.
//   unavailable  — the provider returned nothing this time. It may arrive later.
//
// Collapsing those three into `0` is how an analytics product starts lying, so
// the type system refuses to let a caller do it by accident: a MetricValue is
// either `{ value: number }` or `{ absent: reason }`, never a bare number.

/** Platforms RazeKit models. Superset of publication.ts's PLATFORM_PATTERNS. */
export type SocialPlatform =
  | 'instagram' | 'threads' | 'tiktok' | 'youtube' | 'x' | 'reddit';

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'instagram', 'threads', 'tiktok', 'youtube', 'x', 'reddit',
];

/** Every metric RazeKit knows how to store. Matches SocialPost's fields. */
export type MetricName =
  | 'views' | 'likes' | 'comments' | 'shares' | 'saves'
  | 'watch_time' | 'reach' | 'impressions' | 'follower_growth';

export const METRIC_NAMES: MetricName[] = [
  'views', 'likes', 'comments', 'shares', 'saves',
  'watch_time', 'reach', 'impressions', 'follower_growth',
];

export type AbsenceReason = 'unsupported' | 'unauthorized' | 'unavailable';

export type MetricValue =
  | { readonly value: number; readonly absent?: undefined }
  | { readonly value?: undefined; readonly absent: AbsenceReason };

export const metric = (value: number): MetricValue => ({ value });
export const absent = (reason: AbsenceReason): MetricValue => ({ absent: reason });

/**
 * Narrowing helper. Call this rather than `m.value ?? 0` — the whole design
 * falls over the moment one caller defaults an absence to zero.
 */
export const hasValue = (m: MetricValue | undefined): m is { value: number } =>
  Boolean(m && typeof m.value === 'number' && Number.isFinite(m.value));

/** What an adapter declares it can ever produce, before any call is made. */
export interface MetricCapability {
  readonly metric: MetricName;
  /** False means the API has no such field — do not ask, do not display. */
  readonly supported: boolean;
  /** Exact provider field name, for provenance and for debugging. */
  readonly apiField: string;
  /** Account-type gates, deprecations, media-type limits. */
  readonly notes: string;
}

/** Tokens live here only in memory, never in a client-readable entity. */
export interface AdapterCredentials {
  readonly accessToken: string;
  readonly refreshToken?: string;
  /** Provider's own id for the connected account. */
  readonly accountId?: string;
}

export interface ConnectedAccount {
  readonly accountId: string;
  readonly username?: string;
  readonly displayName?: string;
  readonly profileUrl?: string;
}

/** One post's metrics, with the provenance a brand needs to trust them. */
export interface PostMetrics {
  readonly platform: SocialPlatform;
  readonly providerPostId: string;
  readonly metrics: Partial<Record<MetricName, MetricValue>>;
  /** When the PROVIDER computed these, if it says. Not when we fetched. */
  readonly providerTimestamp?: string;
  /** When RazeKit fetched them. Always set by the sync layer. */
  readonly retrievedAt: string;
}

export interface OwnershipResult {
  /** True only when the provider itself confirms the post is this account's. */
  readonly owned: boolean;
  /**
   * Why we concluded that. Shown to admins, never presented to a creator as an
   * accusation — see the fraud-communication rule.
   */
  readonly reason: string;
  /** False when the API cannot answer the question at all. */
  readonly checkable: boolean;
}

/** Errors an adapter may raise, mapped to something the sync layer can act on. */
export type AdapterErrorKind =
  | 'not_configured'   // no client id/secret in env — the adapter is inert
  | 'unauthorized'     // token rejected; the creator must reconnect
  | 'rate_limited'     // back off and retry later
  | 'not_found'        // post deleted or made private
  | 'provider_error';  // everything else

export class AdapterError extends Error {
  constructor(
    readonly kind: AdapterErrorKind,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface OAuthStart {
  readonly authorizeUrl: string;
  /** Opaque value the callback must echo back. */
  readonly state: string;
}

/**
 * One platform's integration.
 *
 * Adapters are pure I/O against the provider. They do not read or write
 * RazeKit entities, do not decide scoring, and do not persist anything — the
 * sync layer owns all of that. Keeping them side-effect free is what makes them
 * testable without a database and swappable without touching scoring.
 */
export interface SocialAdapter {
  readonly platform: SocialPlatform;
  /** Exact current product name, for the admin diagnostics screen. */
  readonly apiName: string;
  /** What this adapter can ever produce. Declared, not discovered at runtime. */
  readonly capabilities: readonly MetricCapability[];

  /**
   * True only when every credential this adapter needs is present in env.
   * A false here must surface to the user as "not available", never as an
   * empty dashboard that looks like zero engagement.
   */
  configured(): boolean;

  /** Build the provider's consent URL. Throws not_configured when inert. */
  beginOAuth(redirectUri: string, state: string): OAuthStart;

  /** Exchange the callback code for tokens. */
  completeOAuth(code: string, redirectUri: string): Promise<AdapterCredentials>;

  /** Refresh an expiring token, when the provider supports it. */
  refresh?(creds: AdapterCredentials): Promise<AdapterCredentials>;

  /** Who did we just connect? */
  resolveAccount(creds: AdapterCredentials): Promise<ConnectedAccount>;

  /**
   * Prove a submitted post belongs to the connected account.
   *
   * Must consult the provider. A URL that merely *looks* like the creator's is
   * not ownership — that is the hole this method exists to close.
   */
  verifyOwnership(creds: AdapterCredentials, providerPostId: string): Promise<OwnershipResult>;

  /** Fetch metrics for one post. Absences are reasons, never zeros. */
  fetchPostMetrics(creds: AdapterCredentials, providerPostId: string): Promise<PostMetrics>;
}

/** Capability lookup used by the UI to decide what to even render. */
export function supports(adapter: SocialAdapter, name: MetricName): boolean {
  return adapter.capabilities.some((c) => c.metric === name && c.supported);
}

/**
 * Fill every metric the adapter cannot support with `unsupported`, so a caller
 * iterating METRIC_NAMES always gets an explicit answer rather than undefined.
 */
export function withDeclaredAbsences(
  adapter: SocialAdapter,
  found: Partial<Record<MetricName, MetricValue>>,
): Partial<Record<MetricName, MetricValue>> {
  const out: Partial<Record<MetricName, MetricValue>> = { ...found };
  for (const c of adapter.capabilities) {
    if (!c.supported && out[c.metric] === undefined) out[c.metric] = absent('unsupported');
  }
  return out;
}
