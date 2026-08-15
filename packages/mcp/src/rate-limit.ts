/**
 * Per-key rate limiting for the MCP JSON-RPC endpoint (voyant#3935).
 *
 * `/v1/admin/mcp` exposes the whole selected tool surface — including
 * destructive and action-ledgered tools — to autonomous agent clients that
 * retry automatically on failure. Without a throttle, a stuck agent can hammer
 * an irreversible, externally-committing tool as fast as the transport allows.
 *
 * The throttle is intentionally risk-aware. Every request is sorted into one of
 * two buckets, keyed independently so they never share a counter:
 * - `read` — discovery (`initialize`, `tools/list`) and `tools/call` on a
 *   read-only tool. Loose limit.
 * - `write` — `tools/call` on a tool that is anything other than a pure read:
 *   a non-`read` {@link ToolManifestEntry.tier}, a `destructive` risk policy, or
 *   an action-ledgered capability (`actionPolicy`). Tight limit.
 *
 * The bucket is chosen from the tool the request will actually DISPATCH, not
 * from the name on the envelope — see {@link dispatchedToolName}. Classifying the
 * envelope let `call_tool`, the ordinary way to reach the long tail, carry any
 * write at the read limit.
 *
 * The classification reads only manifest metadata already carried by the
 * registry (`tier` / `riskPolicy` / `actionPolicy`) — it invents no new
 * taxonomy. Limits and the window are deployment-configurable with safe
 * defaults; the deployment can also swap the key derivation or the backing
 * store (e.g. a shared `RedisStore` across instances).
 */

import type { ToolManifestEntry, ToolRegistry } from "@voyant-travel/tools"
import type { Context, MiddlewareHandler } from "hono"
import { MemoryStore, rateLimiter, type Store } from "hono-rate-limiter"

import { CALL_TOOL_NAME } from "./meta-tools.js"

/** The two throttle buckets, keyed apart so a read burst never starves writes. */
export type McpRateLimitBucket = "read" | "write"

/** Deployment-tunable limits for the MCP endpoint. All fields are optional. */
export interface McpRateLimitOptions {
  /** Sliding window length in milliseconds. Defaults to 60_000 (one minute). */
  windowMs?: number
  /** Max discovery / read `tools/call` requests per key per window. Defaults to 120. */
  readLimit?: number
  /** Max write / destructive / ledgered `tools/call` requests per key per window. Defaults to 20. */
  writeLimit?: number
  /**
   * Derive the per-caller identity a limit applies to. Defaults to the
   * authenticated API key / token id, falling back to the actor and then to a
   * single shared bucket for unidentified callers.
   */
  keyGenerator?: (c: Context) => string
  /** Backing hit-count store. Defaults to an in-process {@link MemoryStore}. */
  store?: Store
}

/** Safe defaults applied when a deployment does not override a field. */
export const DEFAULT_MCP_RATE_LIMIT = {
  windowMs: 60_000,
  readLimit: 120,
  writeLimit: 20,
} as const

/**
 * A tool is throttled on the tight `write` bucket when it is anything other than
 * a pure read: a non-`read` tier, a destructive risk policy, or an
 * action-ledgered capability. Reads fall through to the loose bucket.
 */
export function isRestrictedTool(entry: ToolManifestEntry): boolean {
  return (
    entry.tier !== "read" ||
    entry.riskPolicy.destructive === true ||
    entry.actionPolicy !== undefined
  )
}

/** Default caller identity: the API key/token id, then the actor, then a shared key. */
function defaultKeyGenerator(c: Context): string {
  const vars = c.var as {
    apiKeyId?: unknown
    apiTokenId?: unknown
    actor?: unknown
  }
  for (const candidate of [vars.apiKeyId, vars.apiTokenId, vars.actor]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate
  }
  return "anonymous"
}

/**
 * Build the set of invocation names (including aliases) that must be throttled
 * on the write bucket. Classification is caller-independent, so it is computed
 * once when the middleware is created.
 */
function restrictedNames(registry: ToolRegistry): ReadonlySet<string> {
  const names = new Set<string>()
  for (const entry of registry.list()) {
    if (!isRestrictedTool(entry)) continue
    names.add(entry.name)
    for (const alias of entry.aliases) names.add(alias)
  }
  return names
}

/**
 * The tool name a `tools/call` will actually dispatch.
 *
 * Two unwrappings, because both are things dispatch already accepts and a
 * throttle that does not accept them is a throttle with a documented way around
 * it:
 *
 * - **`call_tool`.** Progressive disclosure made the meta-tools the ordinary way
 *   to reach the long tail, so `call_tool({name: "issue_invoice_refund"})` is not
 *   an exotic call — it is the normal one. Classified on the outer name it is
 *   `call_tool`, which is in no registry and falls to the loose read bucket, so
 *   every non-eager write ran at the read limit (voyant#4661 review).
 * - **A namespace prefix.** `resolveInvocationName` accepts
 *   `functions.record_payment` because models emit it; if this did not, the
 *   prefix would be a one-character bucket downgrade.
 */
function dispatchedToolName(body: {
  method?: unknown
  params?: { name?: unknown; arguments?: unknown }
}): string | undefined {
  if (body?.method !== "tools/call") return undefined
  const outer = unprefixed(body.params?.name)
  if (outer !== CALL_TOOL_NAME) return outer
  const args = body.params?.arguments
  const inner =
    typeof args === "object" && args !== null ? (args as { name?: unknown }).name : undefined
  return unprefixed(inner) ?? outer
}

/** A tool name with any client namespace prefix (`functions.x`) removed. */
function unprefixed(name: unknown): string | undefined {
  if (typeof name !== "string" || name.length === 0) return undefined
  if (!name.includes(".")) return name
  const tail = name.split(".").pop()
  return tail && tail.length > 0 ? tail : name
}

/** Classify the JSON-RPC request into a bucket, reading only the cached body. */
async function bucketFor(c: Context, restricted: ReadonlySet<string>): Promise<McpRateLimitBucket> {
  try {
    const name = dispatchedToolName(await c.req.json())
    if (name !== undefined && restricted.has(name)) return "write"
  } catch {
    // A malformed body is rejected downstream by the route validator; treat it
    // as a read for throttling so a parse slip cannot bypass the tighter bucket.
  }
  return "read"
}

/**
 * Middleware that rate-limits the MCP JSON-RPC endpoint per caller, with a
 * tighter bucket for write/destructive/ledgered tool calls than for reads. A
 * single limiter instance backs both buckets — the bucket is folded into the
 * key so their counters stay separate — and the per-request limit is chosen
 * from the classified bucket.
 */
export function createMcpRateLimiter(
  registry: ToolRegistry,
  options: McpRateLimitOptions = {},
): MiddlewareHandler {
  const windowMs = options.windowMs ?? DEFAULT_MCP_RATE_LIMIT.windowMs
  const readLimit = options.readLimit ?? DEFAULT_MCP_RATE_LIMIT.readLimit
  const writeLimit = options.writeLimit ?? DEFAULT_MCP_RATE_LIMIT.writeLimit
  const identify = options.keyGenerator ?? defaultKeyGenerator
  const restricted = restrictedNames(registry)

  return rateLimiter({
    windowMs,
    store: options.store ?? new MemoryStore(),
    standardHeaders: "draft-6",
    keyGenerator: async (c) => `${await bucketFor(c, restricted)}:${identify(c)}`,
    limit: async (c) => ((await bucketFor(c, restricted)) === "write" ? writeLimit : readLimit),
  })
}
