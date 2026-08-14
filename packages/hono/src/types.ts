import type {
  Actor,
  VoyantVariables as CoreVoyantVariables,
  EventBus,
  LinkDefinition,
  LinkService,
  ModuleContainer,
  QueryGraphContext,
  QueryRunner,
  VoyantAuthContext,
  VoyantPermission,
} from "@voyant-travel/core"
import type { SelectApikey } from "@voyant-travel/db/schema/iam"
import { dbClientDispose } from "@voyant-travel/db/transaction-capability"
import type { AccessCatalog } from "@voyant-travel/types/api-keys"
import type { KVStore } from "@voyant-travel/utils/cache"
import type { NeonHttpDatabase } from "drizzle-orm/neon-http"
import type { NeonDatabase as NeonWsDatabase } from "drizzle-orm/neon-serverless"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Handler, Hono } from "hono"
import type { ApiBundleInput } from "./bundle.js"
import type { ApiExtension, ApiModule } from "./module.js"
import type { Reporter } from "./observability/reporter.js"

export interface VoyantExecutionContext {
  waitUntil?: (promise: Promise<unknown>) => void
  passThroughOnException?: () => void
}

export interface VoyantBindings {
  INTERNAL_API_KEY?: string
  INTERNAL_API_KEY_SCOPES?: string
  /**
   * `"disabled"` stops accepting the deprecated `voy_` deployment admin key on
   * `/v1/admin/*` (voyant#4625 §4). Anything else — including unset — keeps the
   * compatibility window open. Storefront secret keys and admin sessions are
   * unaffected either way.
   */
  VOYANT_DEPLOYMENT_API_KEY_MODE?: string
  VOYANT_CLOUD_DEPLOYMENT_ID?: string
  SESSION_CLAIMS_ADMIN_SECRET?: string
  SESSION_CLAIMS_CUSTOMER_SECRET?: string
  BETTER_AUTH_ADMIN_SECRET?: string
  BETTER_AUTH_CUSTOMER_SECRET?: string
  DATABASE_URL: string
  CORS_ALLOWLIST?: string
  APP_URL?: string
  DASH_BASE_URL?: string
  API_BASE_URL?: string
  RATE_LIMIT_STORE?: import("./middleware/rate-limit.js").RateLimitStore
  CACHE?: KVStore
  SHARED_STATE?: KVStore
}

export type VoyantDb = PostgresJsDatabase | NeonHttpDatabase | NeonWsDatabase
export type VoyantQueryRuntime = QueryRunner

export type VoyantVariables = CoreVoyantVariables & {
  /**
   * Per-request correlation id (RFC #1553). Set by the `requestId` middleware;
   * also on the `X-Request-Id` response header and readable from any async
   * context via `getRequestId()`.
   */
  requestId?: string
  db: VoyantDb
  /** Shared app/runtime container for explicit service resolution. */
  container: ModuleContainer
  eventBus: EventBus
  /** Shared cross-module link runtime, when the app wires one in. */
  link?: LinkService
  /** Shared cross-module query runtime, when the app wires one in. */
  query?: VoyantQueryRuntime
  /**
   * The deployment's observability sink (RFC #1553), resolved once by
   * `createVoyantApp`. Exposed here so a composed route module can emit its own
   * telemetry through the same sink as the error boundary, without the
   * deployment having to thread a reporter through every composition seam.
   *
   * Always present on a request served by `createVoyantApp` — it falls back to
   * `noopReporter` when the deployment configured none.
   */
  reporter?: Reporter
  /** Logical app name stamped on telemetry, alongside {@link reporter}. */
  appName?: string
  /**
   * Server-derived Storefront sales-channel context. Public request parameters
   * must not set this; auth/middleware derives it from the resolved storefront
   * identity and its deployment-owned Channel binding.
   */
  storefrontChannel?: {
    storefrontId: string
    channelId: string
    channelStatus?: string | null
  }
}

/** Handler contract for application-authored Hono API routes. */
export type VoyantRouteHandler<TBindings extends VoyantBindings = VoyantBindings> = Handler<{
  Bindings: TBindings
  Variables: VoyantVariables
}>

/**
 * Per-request handle returned by a {@link DbFactory} that owns its own
 * Pool / connection: a drizzle client plus a `dispose()` the db middleware
 * schedules via `c.executionCtx.waitUntil` after the response is sent. Node
 * deployments can adapt their process-owned pool with `openNodeDatabase` from
 * `@voyant-travel/db/runtime`; request-scoped runtimes must close their client
 * in `dispose()`.
 */
export interface DisposableDb {
  db: VoyantDb
  dispose: () => Promise<void>
}

export type DbFactory<TBindings extends VoyantBindings = VoyantBindings> = (
  env: TBindings,
) => VoyantDb | DisposableDb

/**
 * Result of routing a request path to a db factory (see
 * {@link DbFactorySelector}).
 */
export interface DbSurfaceSelection<TBindings extends VoyantBindings = VoyantBindings> {
  factory: DbFactory<TBindings>
  /**
   * Whether this surface must receive an interactive-transaction-capable
   * client. The db middleware asserts the resolved client's capability
   * tag when `true` and skips the assertion when `false` (the default
   * http-backed client is deliberately transaction-incapable).
   */
  mustSupportTransactions: boolean
}

/**
 * Routes a request path to the db factory that should serve it. Built by
 * `createApp` when the deployment supplies both a default (http-backed)
 * and a transactional (WebSocket-backed) factory: surfaces owned by
 * modules that declare `requiresTransactionalDb` get the transactional
 * factory; everything else gets the cheap default. The selector MUST
 * return stable factory references — per-request client sharing
 * (`acquireRequestDb`) keys on factory identity.
 */
export interface DbFactorySelector<TBindings extends VoyantBindings = VoyantBindings> {
  select(path: string): DbSurfaceSelection<TBindings>
}

/** Either a single factory for all requests, or a per-path selector. */
export type DbSource<TBindings extends VoyantBindings = VoyantBindings> =
  | DbFactory<TBindings>
  | DbFactorySelector<TBindings>

export function isDbFactorySelector<TBindings extends VoyantBindings>(
  source: DbSource<TBindings>,
): source is DbFactorySelector<TBindings> {
  return typeof source !== "function" && typeof source.select === "function"
}

/** Normalize a {@link DbSource} to the factory serving `path`. */
export function selectDbFactory<TBindings extends VoyantBindings>(
  source: DbSource<TBindings>,
  path: string,
): DbFactory<TBindings> {
  return isDbFactorySelector(source) ? source.select(path).factory : source
}

export function isDisposableDb(value: VoyantDb | DisposableDb): value is DisposableDb {
  return (
    typeof (value as DisposableDb).dispose === "function" &&
    (value as DisposableDb).db !== undefined
  )
}

/**
 * Normalize a {@link DbFactory} return value to `{ db, dispose? }` so
 * call sites don't repeat the `isDisposableDb` shape check. `dispose`
 * is `undefined` for plain `VoyantDb` factories.
 */
export function resolveDbFactoryResult(value: VoyantDb | DisposableDb): {
  db: VoyantDb
  dispose?: () => Promise<void>
} {
  if (isDisposableDb(value)) {
    return value
  }

  const dispose = dbClientDispose(value)
  return dispose ? { db: value, dispose } : { db: value }
}

/**
 * The shape returned by a custom `auth.resolve` integration. Both `userId`
 * and `actor` are required: `requireActor` is fail-closed, so a resolver
 * that omits `actor` would 401 every protected request. Make the omission a
 * compile-time error instead of a runtime mystery.
 */
export type VoyantRequestAuthContext = Omit<VoyantAuthContext, "actor"> & {
  userId: string
  actor: Actor
  /** Explicit security realm when the context represents a user session. */
  realm?: "admin" | "customer"
}

/** User-session identity returned by a custom `auth.resolve` adapter. */
export type VoyantResolvedSessionAuthContext = VoyantRequestAuthContext & {
  realm: "admin" | "customer"
}

export interface LogEntry {
  method: string
  path: string
  status: number
  durationMs: number
  /** Per-request correlation id (RFC #1553), when available. */
  requestId?: string
}

export interface LoggerProvider {
  log(entry: LogEntry): void
}

export interface VoyantAuthResolveArgs<TBindings extends VoyantBindings = VoyantBindings> {
  request: Request
  env: TBindings
  db: VoyantDb
  ctx?: VoyantExecutionContext
}

export interface VoyantAuthAppTokenResolveArgs<TBindings extends VoyantBindings = VoyantBindings>
  extends VoyantAuthResolveArgs<TBindings> {
  token: string
}

export interface VoyantAuthPermissionArgs<TBindings extends VoyantBindings = VoyantBindings>
  extends VoyantAuthResolveArgs<TBindings> {
  permission: VoyantPermission
  auth: VoyantRequestAuthContext
}

export interface VoyantAuthApiKeyValidationArgs<TBindings extends VoyantBindings = VoyantBindings>
  extends VoyantAuthResolveArgs<TBindings> {
  apiKey: SelectApikey
}

export interface VoyantAuthUnauthorizedArgs<TBindings extends VoyantBindings = VoyantBindings> {
  request: Request
  env: TBindings
  ctx?: VoyantExecutionContext
}

export interface VoyantAuthIntegration<TBindings extends VoyantBindings = VoyantBindings> {
  handler?: (env: TBindings) => {
    fetch: (
      req: Request,
      env: TBindings,
      ctx?: VoyantExecutionContext,
    ) => Response | Promise<Response>
  }
  /**
   * Resolve the request to an auth context, or return `null` for anonymous.
   *
   * The returned object MUST include both `actor` and `realm`. Admin sessions
   * use `realm: "admin"` with `actor: "staff"`; customer, partner, or supplier
   * sessions use `realm: "customer"` with the corresponding non-staff actor.
   * Realm/actor mismatches fail closed so credentials cannot cross between
   * `/v1/admin/*` and `/v1/public/*`.
   */
  resolve?: (
    args: VoyantAuthResolveArgs<TBindings>,
  ) => Promise<VoyantResolvedSessionAuthContext | null> | VoyantResolvedSessionAuthContext | null
  resolveAppToken?: (
    args: VoyantAuthAppTokenResolveArgs<TBindings>,
  ) => Promise<VoyantAuthContext | null> | VoyantAuthContext | null
  /**
   * Resolve an MCP connector's OAuth 2.1 access token (the grant a chat
   * assistant obtains through the consent flow) into an auth context.
   *
   * Only consulted on the MCP surface: the grant authorizes tool dispatch for
   * the staff member who approved the connector, and must never be accepted as
   * a general admin credential on other `/v1/admin/*` routes.
   */
  resolveMcpToken?: (
    args: VoyantAuthAppTokenResolveArgs<TBindings>,
  ) => Promise<VoyantAuthContext | null> | VoyantAuthContext | null
  hasPermission?: (args: VoyantAuthPermissionArgs<TBindings>) => Promise<boolean> | boolean
  validateApiKey?: (args: VoyantAuthApiKeyValidationArgs<TBindings>) => Promise<boolean> | boolean
  onUnauthorized?: (
    args: VoyantAuthUnauthorizedArgs<TBindings>,
  ) => Promise<Response | null> | Response | null
  /**
   * Authorize a customer-realm cross-origin request for dynamic CORS. Returns
   * the exact request origin to echo in `Access-Control-Allow-Origin` (dynamic,
   * per-storefront), or `null` to fall back to the static `CORS_ALLOWLIST`.
   * Runs before the db middleware, so implementations own any db access. Only
   * consulted for the customer surface; admin/dash keep the static allowlist.
   */
  resolveCorsOrigin?: (
    args: VoyantAuthUnauthorizedArgs<TBindings>,
  ) => Promise<string | null> | string | null
}

export interface VoyantAppConfig<TBindings extends VoyantBindings = VoyantBindings> {
  db: DbFactory<TBindings>
  /**
   * Optional transaction-capable db factory (e.g. a per-request Neon
   * WebSocket Pool). When provided, `createApp` routes requests by
   * surface: routes of modules declaring `requiresTransactionalDb` (plus
   * any `dbTransactionalPaths`) get this factory; every other request is
   * served by the cheap `db` factory (typically neon-http — zero
   * connection handshake). When omitted, `db` serves everything
   * (previous behavior).
   */
  dbTransactional?: DbFactory<TBindings>
  /**
   * Extra path prefixes that must receive the transactional client —
   * for starter-owned routes mounted via `additionalRoutes` that run
   * interactive transactions (e.g. `"/api/checkout"`). Only meaningful
   * together with `dbTransactional`.
   */
  dbTransactionalPaths?: string[]
  modules?: ApiModule[]
  extensions?: ApiExtension[]
  plugins?: ApiBundleInput[]
  eventBus?: EventBus
  /**
   * Link definitions activated against each request's resolved database.
   * Combined with definitions contributed by eager bundles. Cannot be used
   * together with an explicitly constructed `link` service.
   */
  linkDefinitions?: readonly LinkDefinition[]
  link?: LinkService
  query?: QueryGraphContext | VoyantQueryRuntime
  auth?: VoyantAuthIntegration<TBindings>
  /**
   * Hosting/deployment prefix to strip before app-local path decisions such as
   * auth publicPaths, public-write rate limiting, actor guards, and DB surface
   * selection. Example: a Hono app mounted at `/api` still declares routes and
   * publicPaths as `/v1/...`, so set `basePath: "/api"`.
   */
  basePath?: string
  publicPaths?: string[]
  /**
   * Absolute `/v1/public/*` paths a publishable (`vpk_`) storefront key may
   * call, beyond what modules declare via `publishable` (voyant#4625). The same
   * escape hatch `publicPaths` is — for a route no module owns.
   *
   * Leaving this empty does not mean "unrestricted": the capability line is an
   * allow-list, so anything not declared here or by a module is reachable only
   * with a secret key.
   */
  publishablePaths?: string[]
  /**
   * Absolute `/v1/public/*` paths that capture unchallenged person data, beyond
   * what modules declare via `guardedIntake` (voyant#4625).
   */
  guardedIntakePaths?: string[]
  /**
   * Whether this deployment has wired a guard in front of unchallenged public
   * intake (a CAPTCHA, a proof-of-work, whatever it chose). Defaults to
   * `false`, which keeps every `guardedIntake` path secret-key-only. The
   * framework supplies the seam and the fail-closed default; what fills it is
   * the deployment's business.
   */
  publicIntakeGuarded?: boolean
  /** Selected graph mount-to-resource authorization overrides. */
  accessResources?: readonly {
    path: string
    resource: string
    authorization?: "coarse" | "route"
  }[]
  /** Effective selected-plus-legacy catalog used for wildcard policy. */
  accessCatalog?: AccessCatalog
  logger?: LoggerProvider
  /**
   * Observability sink for unhandled exceptions at framework catch points
   * (RFC #1553). Receives a normalized `{ requestId, app, error, context }`
   * event for every 5xx — the `requestId` matches the one surfaced to the user
   * on `X-Request-Id`, so a reported reference is findable in the backend.
   * Defaults to a no-op (zero vendor coupling). Supply a `Reporter` — a
   * Sentry/OpenTelemetry adapter, or the built-in `consoleReporter` — to wire a
   * backend. The framework owns the catch points + event shape; the sink is a
   * deployment choice.
   */
  reporter?: Reporter
  /**
   * Logical name for this app/worker, stamped on emitted error events and used
   * for log correlation. Defaults to `"voyant"`.
   */
  appName?: string
  /**
   * Shared response cache for the public surface (`/v1/public/*` by
   * default). Enabled by default but inert until a route marks its
   * response `Cache-Control: public, s-maxage=…` — personalized routes
   * are never cached. Set `false` to disable, or pass options to tune
   * prefixes/limits. Uses the injected `env.CACHE` KVStore when one is
   * available.
   */
  publicCache?: false | import("./middleware/public-cache.js").PublicCacheOptions
  /**
   * Transactional outbox (RFC #1687 Phase 2.1). When `true`, request
   * emits persist the envelope to the `event_outbox` table BEFORE any
   * subscriber runs (durable, at-least-once with retry/dead-letter via
   * `drainOutbox` from `@voyant-travel/db/outbox`). Requires the
   * `event_outbox` migration. Deployments should run a periodic drain
   * (cron) for redelivery of failed/interrupted deliveries:
   * `drainOutbox(db, app.eventBus)`. Services needing write atomicity
   * insert rows inside their own transaction via
   * `insertOutboxEvents(tx, ...)`. Default off.
   */
  outbox?: boolean
  /**
   * Default request body limit enforced before route handlers parse
   * JSON/form data. Content-type-aware: JSON bodies are capped at 10 MiB
   * (`jsonMaxBytes`), non-JSON bodies (uploads) at the 26 MiB outer ceiling
   * (`maxBytes`). Set `false` to disable, or override either cap.
   */
  requestBodyLimit?: false | { maxBytes?: number; jsonMaxBytes?: number }
  /**
   * Default app-wide security headers. Enabled by default. Set `false`
   * to disable, or override CSP/HSTS via the option object.
   */
  securityHeaders?: false | import("./middleware/security-headers.js").SecurityHeadersOptions
  /**
   * Default app-wide rate limits. Enabled by default for `/auth/*` POSTs
   * and unauthenticated public writes. Set `false` to disable or tune
   * individual policies.
   */
  rateLimit?: false | import("./middleware/rate-limit.js").RateLimitConfig
  /**
   * Admin API capability metadata, served at `GET /v1/admin/_meta/capabilities`
   * so clients (the admin SDK) can discover what this deployment supports —
   * enabled modules, available operations, contract/deployment version, and the
   * caller's resolved actor + scopes. Provide it from `@voyant-travel/admin-contracts`:
   * `{ contractVersion: ADMIN_CONTRACT_VERSION, operations: operationCapabilities() }`.
   * When omitted, the route is not mounted. Typed structurally so `@voyant-travel/hono`
   * stays decoupled from `@voyant-travel/admin-contracts`.
   */
  adminMeta?: {
    contractVersion: string
    deploymentVersion?: string
    operations: ReadonlyArray<{
      id: string
      method: string
      pathTemplate: string
      classification: string
      scopes: string[]
      capabilityKey?: string
    }>
  }
  // biome-ignore lint/suspicious/noExplicitAny: reason: Hono sub-apps need to accept host-specific binding and variable generics.
  additionalRoutes?: (app: Hono<any>) => void
}
