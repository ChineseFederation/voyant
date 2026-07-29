import type { PoolConfig } from "@neondatabase/serverless"

/**
 * Timeout knobs applied across `createDbClient` adapters. All values are
 * milliseconds. Pass `false` to disable a specific timeout entirely.
 *
 * Adapter coverage:
 * - `serverless` (Neon WebSocket `Pool`): `statementMs` → `statement_timeout`
 *   (server-side), `queryMs` → `query_timeout` (client-side backstop),
 *   `connectMs` → `connectionTimeoutMillis`.
 * - `node` (postgres-js): `statementMs` → `connection.statement_timeout`
 *   (server-side startup parameter), `connectMs` → `connect_timeout`
 *   (rounded up to whole seconds). `queryMs` has no postgres-js equivalent
 *   and is ignored.
 * - `edge` (neon-http): per-query timeouts are not configurable on the Neon
 *   HTTP client; queries rely on the server-side default `statement_timeout`
 *   and the Workers runtime's own request limits. All fields are ignored.
 */
export interface DbTimeoutOptions {
  /**
   * Server-side `statement_timeout` in ms. Default `10_000`.
   * `false` disables it (server default applies).
   */
  statementMs?: number | false
  /**
   * Client-side query timeout in ms (serverless `Pool` only). Default
   * `15_000`. `false` disables it.
   */
  queryMs?: number | false
  /**
   * Connection-establishment timeout in ms. Default `10_000`.
   * `false` disables it.
   */
  connectMs?: number | false
}

/** Default timeouts applied when no override is provided. */
export const DEFAULT_DB_TIMEOUTS = {
  statementMs: 10_000,
  queryMs: 15_000,
  connectMs: 10_000,
} as const

/**
 * Close idle postgres-js sockets well before a typical serverless Postgres
 * suspend window. Resident application processes must not keep an otherwise
 * idle database compute awake indefinitely.
 */
export const DEFAULT_NODE_IDLE_TIMEOUT_SECONDS = 30

/**
 * Build the `PoolConfig` for the `serverless` adapter (Neon WebSocket Pool).
 *
 * Defaults are applied first and caller-supplied `pool` values spread after,
 * so explicit pool config always wins. `connectionString` is pinned last and
 * cannot be overridden through `pool`.
 *
 * Why BOTH `statement_timeout` and `query_timeout`: `statement_timeout` is a
 * Postgres startup parameter, and transaction-mode poolers (PgBouncer — which
 * Neon's `-pooler` endpoints run) may ignore startup parameters because the
 * pooled server session is shared across clients. `query_timeout` is enforced
 * client-side by node-postgres, so it acts as the backstop that still fires
 * when the pooler swallowed `statement_timeout`.
 */
export function resolveServerlessPoolConfig(
  connectionString: string,
  options?: {
    pool?: Omit<PoolConfig, "connectionString">
    timeouts?: DbTimeoutOptions
  },
): PoolConfig {
  const statementMs = options?.timeouts?.statementMs ?? DEFAULT_DB_TIMEOUTS.statementMs
  const queryMs = options?.timeouts?.queryMs ?? DEFAULT_DB_TIMEOUTS.queryMs
  const connectMs = options?.timeouts?.connectMs ?? DEFAULT_DB_TIMEOUTS.connectMs

  const defaults: Omit<PoolConfig, "connectionString"> = {}
  if (statementMs !== false) {
    defaults.statement_timeout = statementMs
  }
  if (queryMs !== false) {
    defaults.query_timeout = queryMs
  }
  if (connectMs !== false) {
    defaults.connectionTimeoutMillis = connectMs
  }

  return { ...defaults, ...options?.pool, connectionString }
}

/**
 * Options accepted by postgres-js that the `node` adapter configures.
 * Kept structural (instead of importing postgres-js `Options`) so the
 * resolver stays a pure, dependency-free function that's easy to test.
 */
export interface NodePostgresOptions {
  max?: number
  /** Seconds before postgres-js closes an idle socket. */
  idle_timeout?: number
  /** Connection-establishment timeout in SECONDS (postgres-js convention). */
  connect_timeout?: number
  /** Startup parameters sent to Postgres; `statement_timeout` is in ms. */
  connection?: { statement_timeout: number }
}

/**
 * Build the postgres-js options object for the `node` adapter.
 *
 * - `statementMs` → `connection.statement_timeout` (ms, server-side).
 * - `connectMs` → `connect_timeout` (postgres-js takes seconds; rounded up).
 * - `idleSeconds` → `idle_timeout` (defaults to 30 seconds; `false` disables it).
 * - `queryMs` is ignored — postgres-js has no client-side per-query timeout.
 */
export function resolveNodePostgresOptions(options?: {
  max?: number
  idleSeconds?: number | false
  timeouts?: DbTimeoutOptions
}): NodePostgresOptions {
  const statementMs = options?.timeouts?.statementMs ?? DEFAULT_DB_TIMEOUTS.statementMs
  const connectMs = options?.timeouts?.connectMs ?? DEFAULT_DB_TIMEOUTS.connectMs

  const config: NodePostgresOptions = {}
  const idleSeconds =
    options?.idleSeconds === undefined ? DEFAULT_NODE_IDLE_TIMEOUT_SECONDS : options.idleSeconds
  if (options?.max !== undefined) {
    config.max = options.max
  }
  if (idleSeconds !== false) {
    config.idle_timeout = idleSeconds
  }
  if (connectMs !== false) {
    config.connect_timeout = Math.ceil(connectMs / 1000)
  }
  if (statementMs !== false) {
    config.connection = { statement_timeout: statementMs }
  }
  return config
}

function hostnameOf(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname || null
  } catch {
    return null
  }
}

/** Whether the connection string targets a Neon host (`*.neon.tech` etc.). */
export function isNeonConnectionString(connectionString: string): boolean {
  const host = hostnameOf(connectionString)
  return host !== null && (host.endsWith(".neon.tech") || host.includes(".neon."))
}

/**
 * Whether the connection string targets Neon's pooled (PgBouncer) endpoint —
 * the host contains the `-pooler` infix. Returns `false` for non-Neon hosts.
 *
 * Per-request pools (the `serverless` adapter on Workers) should always use
 * the `-pooler` host: the direct endpoint has a low `max_connections`
 * ceiling that per-request pools exhaust quickly.
 */
export function isPooledNeonConnectionString(connectionString: string): boolean {
  if (!isNeonConnectionString(connectionString)) {
    return false
  }
  return hostnameOf(connectionString)?.includes("-pooler") ?? false
}

const warnedDirectNeonEndpoints = new Set<string>()

/**
 * Warn (once per unique connection string per process) when a per-request
 * pool is created against Neon's DIRECT endpoint instead of the `-pooler`
 * host. Never warns for localhost or non-Neon hosts, and never throws.
 */
export function warnIfDirectNeonEndpoint(connectionString: string): void {
  if (!isNeonConnectionString(connectionString) || isPooledNeonConnectionString(connectionString)) {
    return
  }
  if (warnedDirectNeonEndpoints.has(connectionString)) {
    return
  }
  warnedDirectNeonEndpoints.add(connectionString)
  console.warn(
    "[@voyant-travel/db] The serverless adapter is connecting to a Neon DIRECT endpoint " +
      `(${hostnameOf(connectionString) ?? "unknown host"}). Direct endpoints have a low ` +
      "max_connections ceiling that per-request pools exhaust quickly. Use the pooled " +
      'endpoint instead (the host containing "-pooler", e.g. ' +
      '"...-pooler.region.aws.neon.tech").',
  )
}
