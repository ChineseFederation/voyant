import type { Actor, VoyantAuthContext } from "@voyant-travel/core"
import { apikeyTable, cloudAuthUserLinks, type SelectApikey } from "@voyant-travel/db/schema/iam"
import { API_KEY_AUDIENCES, permissionsToStrings } from "@voyant-travel/types/api-keys"
import type { KVStore } from "@voyant-travel/utils/cache"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import type { MiddlewareHandler } from "hono"

import { constantTimeEqual, sha256Base64Url, sha256Hex } from "../auth/crypto.js"
import { extractBearerToken, verifySession } from "../auth/session-jwt.js"
import type { AbsoluteClientAuthenticatedRoute } from "../client-authenticated-routes.js"
import { matchesClientAuthenticatedRoute } from "../client-authenticated-routes.js"
import { tryGetExecutionCtx } from "../lib/execution-ctx.js"
import { matchesPublicPath, normalizePathname } from "../lib/public-paths.js"
import {
  type DbSource,
  selectDbFactory,
  type VoyantAuthIntegration,
  type VoyantBindings,
  type VoyantRequestAuthContext,
  type VoyantVariables,
} from "../types.js"
import { acquireRequestDb } from "./request-db.js"

const API_KEY_PREFIX = "voy_"
const ACTING_USER_HEADER = "x-voyant-acting-user-id"
const ACTING_USER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/

/** Read acting identity only after the request has matched a trusted internal key. */
function trustedActingUserId(header: string | undefined): string | undefined {
  const value = header?.trim()
  return value && ACTING_USER_ID_PATTERN.test(value) ? value : undefined
}

/**
 * Parse `INTERNAL_API_KEY` as one-or-more comma-separated values, so the
 * credential can be rotated without a window where one side rejects the
 * other: deploy `new,old`, flip callers to `new`, then drop `old`.
 */
function parseInternalApiKeys(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseInternalApiKeyScopes(raw: string | undefined): string[] {
  const scopes = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  return scopes.length > 0 ? scopes : ["*:*"]
}

/**
 * Timing-safe membership check for the internal API key. Both sides are
 * SHA-256-hashed before comparison so the constant-time equality runs on
 * fixed-length digests — masking both content and length of the
 * configured keys. Every configured key is checked (no early exit) so
 * the match position is not observable either.
 */
async function matchesInternalApiKey(token: string, keys: string[]): Promise<boolean> {
  const tokenDigest = await sha256Hex(token)
  let matched = false
  for (const key of keys) {
    if (constantTimeEqual(tokenDigest, await sha256Hex(key))) {
      matched = true
    }
  }
  return matched
}

// ---- API-key lookup cache (env.CACHE KV) ----
//
// Validating a `voy_` key costs one Postgres SELECT per request. For
// keys WITHOUT a usage quota (`remaining === null`) the row is cached in
// KV for a short TTL so steady-state server-to-server traffic skips the
// DB roundtrip. Quota-limited keys are never cached — their remaining
// count must be read fresh. Trade-off: disabling/revoking a cached key
// takes effect within the TTL, not instantly.

const API_KEY_CACHE_PREFIX = "apikey:v1:"
/** KV minimum is 60s; keep revocation latency at that floor. */
const API_KEY_CACHE_TTL_SECONDS = 60
const API_KEY_DATE_FIELDS = [
  "createdAt",
  "updatedAt",
  "expiresAt",
  "lastRequest",
  "lastRefillAt",
] as const

async function readCachedApiKey(kv: KVStore, keyHash: string): Promise<SelectApikey | null> {
  try {
    const entry = await kv.get<Record<string, unknown>>(`${API_KEY_CACHE_PREFIX}${keyHash}`, {
      type: "json",
    })
    if (!entry || typeof entry !== "object") return null
    for (const field of API_KEY_DATE_FIELDS) {
      const value = entry[field]
      if (typeof value === "string") entry[field] = new Date(value)
    }
    return entry as SelectApikey
  } catch {
    return null
  }
}

async function writeCachedApiKey(kv: KVStore, keyHash: string, row: SelectApikey): Promise<void> {
  try {
    await kv.put(`${API_KEY_CACHE_PREFIX}${keyHash}`, JSON.stringify(row), {
      expirationTtl: API_KEY_CACHE_TTL_SECONDS,
    })
  } catch {
    // cache writes are best-effort
  }
}

const API_KEY_AUDIENCE_SET = new Set<string>(API_KEY_AUDIENCES)

/**
 * Extract the grant audience from an API key's `metadata` JSON. Malformed or
 * absent metadata falls back to `"staff"` (legacy server-to-server default).
 */
function resolveApiKeyAudience(metadata: string | null | undefined): Actor {
  if (!metadata) return "staff"
  try {
    const parsed = JSON.parse(metadata) as { audience?: unknown }
    const value = parsed?.audience
    if (typeof value === "string" && API_KEY_AUDIENCE_SET.has(value)) {
      return value as Actor
    }
  } catch {
    // Ignore malformed metadata — fall back to the staff default.
  }
  return "staff"
}

function applyAuthContext(
  c: {
    set: <K extends keyof VoyantVariables>(key: K, value: VoyantVariables[K]) => void
  },
  auth: VoyantAuthContext,
) {
  if (auth.userId) c.set("userId", auth.userId)
  if (auth.sessionId) c.set("sessionId", auth.sessionId)
  if (auth.realm) c.set("realm", auth.realm)
  if (auth.isAnonymousRequest !== undefined) {
    c.set("isAnonymousRequest", auth.isAnonymousRequest)
  }
  if (auth.organizationId !== undefined) c.set("organizationId", auth.organizationId ?? undefined)
  if (auth.buyerAccountId !== undefined) c.set("buyerAccountId", auth.buyerAccountId ?? undefined)
  if (auth.buyerAccountKind !== undefined) c.set("buyerAccountKind", auth.buyerAccountKind)
  if (auth.authOrganizationId !== undefined) {
    c.set("authOrganizationId", auth.authOrganizationId ?? undefined)
  }
  if (auth.relationshipOrganizationId !== undefined) {
    c.set("relationshipOrganizationId", auth.relationshipOrganizationId ?? undefined)
  }
  if (auth.relationshipPersonId !== undefined) {
    c.set("relationshipPersonId", auth.relationshipPersonId ?? undefined)
  }
  if (auth.buyerMembershipId !== undefined) {
    c.set("buyerMembershipId", auth.buyerMembershipId ?? undefined)
  }
  if (auth.buyerMembershipRole !== undefined) {
    c.set("buyerMembershipRole", auth.buyerMembershipRole ?? undefined)
  }
  if (auth.callerType) c.set("callerType", auth.callerType)
  if (auth.actor) c.set("actor", auth.actor)
  if (auth.audience !== undefined) {
    c.set("audience", auth.audience)
  } else if (auth.actor) {
    // VoyantAuthContext defines an omitted grant audience as the authenticated
    // actor. Normalize once here so every downstream surface, including MCP,
    // receives the same complete authorization context.
    c.set("audience", auth.actor)
  }
  if (auth.scopes !== undefined) c.set("scopes", auth.scopes)
  if (auth.isInternalRequest !== undefined) c.set("isInternalRequest", auth.isInternalRequest)
  if (auth.apiTokenId) c.set("apiTokenId", auth.apiTokenId)
  if (auth.apiKeyId) c.set("apiKeyId", auth.apiKeyId)
  if (auth.principalSubtype) c.set("principalSubtype", auth.principalSubtype)
  if (auth.appId) c.set("appId", auth.appId)
  if (auth.appInstallationId) c.set("appInstallationId", auth.appInstallationId)
  if (auth.appReleaseId) c.set("appReleaseId", auth.appReleaseId)
  if (auth.appCredentialGeneration !== undefined) {
    c.set("appCredentialGeneration", auth.appCredentialGeneration)
  }
  if (auth.appWorkloadEnvironmentId) {
    c.set("appWorkloadEnvironmentId", auth.appWorkloadEnvironmentId)
  }
  if (auth.appContractGeneration !== undefined) {
    c.set("appContractGeneration", auth.appContractGeneration)
  }
  if (auth.appTokenMode) c.set("appTokenMode", auth.appTokenMode)
  if (auth.appViewerId) c.set("appViewerId", auth.appViewerId)
  if (auth.appContextConstraint) c.set("appContextConstraint", auth.appContextConstraint)
}

function matchesRequestRealm(path: string, auth: VoyantRequestAuthContext): boolean {
  if (path === "/v1/admin" || path.startsWith("/v1/admin/")) {
    return auth.actor === "staff" && auth.realm === "admin"
  }
  if (path === "/v1/public" || path.startsWith("/v1/public/")) {
    return auth.actor !== "staff" && auth.realm === "customer"
  }
  return false
}

export function requireAuth<TBindings extends VoyantBindings>(
  dbSource: DbSource<TBindings>,
  opts?: {
    publicPaths?: string[]
    optionalCustomerAuthPaths?: string[]
    clientAuthenticatedRoutes?: readonly AbsoluteClientAuthenticatedRoute[]
    basePath?: string
    auth?: VoyantAuthIntegration<TBindings>
  },
): MiddlewareHandler<{
  Bindings: TBindings
  Variables: VoyantVariables
}> {
  const publicPaths = opts?.publicPaths ?? []
  const optionalCustomerAuthPaths = opts?.optionalCustomerAuthPaths ?? []

  return async (c, next) => {
    if (c.req.method === "OPTIONS") return next()

    const url = new URL(c.req.url)
    const p = normalizePathname(url.pathname, { basePath: opts?.basePath })
    // Resolve the surface-appropriate factory once — the db middleware
    // downstream resolves the same one, so both share one client.
    const dbFactory = selectDbFactory(dbSource, p)
    const isPublicAuth = p === "/auth/callback" || p.startsWith("/auth/")
    const isHealthCheck = p === "/health"

    if (isPublicAuth || isHealthCheck) return next()

    if (matchesClientAuthenticatedRoute(c.req.method, p, opts?.clientAuthenticatedRoutes ?? [])) {
      return next()
    }

    const isAnonymousPath = matchesPublicPath(p, publicPaths)
    const isOptionalCustomerAuthPath = matchesPublicPath(p, optionalCustomerAuthPaths)
    if (isAnonymousPath && !isOptionalCustomerAuthPath) {
      c.set("isAnonymousRequest", true)
      return next()
    }

    const authHeader = c.req.header("authorization") || c.req.header("Authorization")
    const token = extractBearerToken(authHeader)

    // Strategy 1: Internal API Key
    const internalKeys = parseInternalApiKeys(c.env.INTERNAL_API_KEY)
    if (token && internalKeys.length > 0 && (await matchesInternalApiKey(token, internalKeys))) {
      const actingUserHeader = c.req.header(ACTING_USER_HEADER)
      const assertedActingUserId = trustedActingUserId(actingUserHeader)
      if (actingUserHeader !== undefined && !assertedActingUserId) {
        return c.json({ error: "Invalid acting user" }, 401)
      }
      const cloudDeploymentId = c.env.VOYANT_CLOUD_DEPLOYMENT_ID?.trim()
      if (assertedActingUserId && !cloudDeploymentId) {
        return c.json({ error: "Invalid acting user" }, 401)
      }
      const lease = assertedActingUserId ? acquireRequestDb(c, dbFactory) : undefined
      try {
        let actingUserId: string | undefined
        if (assertedActingUserId && lease) {
          const [link] = await lease.db
            .select({ userId: cloudAuthUserLinks.userId })
            .from(cloudAuthUserLinks)
            .where(
              and(
                eq(cloudAuthUserLinks.providerId, "voyant-cloud"),
                eq(cloudAuthUserLinks.deploymentId, cloudDeploymentId as string),
                isNull(cloudAuthUserLinks.revokedAt),
                or(
                  eq(cloudAuthUserLinks.providerAccountId, assertedActingUserId),
                  eq(cloudAuthUserLinks.userId, assertedActingUserId),
                ),
              ),
            )
            .limit(1)
          actingUserId = link?.userId
          if (!actingUserId) {
            return c.json({ error: "Invalid acting user" }, 401)
          }
        }

        applyAuthContext(c, {
          ...(actingUserId ? { userId: actingUserId, principalSubtype: "max" } : {}),
          callerType: "internal",
          isInternalRequest: true,
          actor: "staff",
          scopes: parseInternalApiKeyScopes(c.env.INTERNAL_API_KEY_SCOPES),
        })
        return await next()
      } finally {
        await lease?.release()
      }
    }

    // Strategy 2: Core-owned API key support (voy_ prefixed)
    if (token?.startsWith(API_KEY_PREFIX)) {
      // Shared per-request client — the db middleware downstream reuses
      // this same client instead of opening a second Pool.
      const lease = acquireRequestDb(c, dbFactory)
      const db = lease.db
      try {
        const keyHash = await sha256Base64Url(token)

        const kv = c.env.CACHE
        let row = kv ? await readCachedApiKey(kv, keyHash) : null
        if (!row) {
          const [dbRow] = await db
            .select()
            .from(apikeyTable)
            .where(and(eq(apikeyTable.key, keyHash), eq(apikeyTable.enabled, true)))
            .limit(1)
          row = dbRow ?? null
          // Only quota-less keys are cacheable — `remaining` must be
          // read fresh for limited keys.
          if (row && row.remaining === null && kv) {
            const cacheable = row
            tryGetExecutionCtx(c)?.waitUntil(writeCachedApiKey(kv, keyHash, cacheable))
          }
        }

        if (!row?.enabled) {
          return c.json({ error: "Invalid API key" }, 401)
        }

        if (row.expiresAt && row.expiresAt < new Date()) {
          return c.json({ error: "API key expired" }, 401)
        }

        if (row.remaining !== null && row.remaining <= 0) {
          return c.json({ error: "API key usage limit exceeded" }, 429)
        }

        if (opts?.auth?.validateApiKey) {
          const isValid = await opts.auth.validateApiKey({
            request: c.req.raw,
            env: c.env,
            db,
            // Guarded: Hono throws on `executionCtx` access outside Workers.
            ctx: tryGetExecutionCtx(c),
            apiKey: row,
          })

          if (!isValid) {
            return c.json({ error: "Invalid API key" }, 401)
          }
        }

        // Usage counters update off the response path, as SQL increments
        // so concurrent requests (and cache-served rows) never clobber
        // each other with stale arithmetic. The query promise starts
        // immediately either way; `waitUntil` (when the runtime has one)
        // just keeps the isolate alive until it settles.
        const counterUpdate = db
          .update(apikeyTable)
          .set({
            // agent-quality: raw-sql reviewed -- Atomic quota counters must increment in SQL to avoid stale read/modify/write races.
            requestCount: sql`${apikeyTable.requestCount} + 1`,
            lastRequest: new Date(),
            // agent-quality: raw-sql reviewed -- Atomic remaining decrement is guarded by the selected API-key row and avoids concurrent quota clobbering.
            ...(row.remaining !== null ? { remaining: sql`${apikeyTable.remaining} - 1` } : {}),
          })
          .where(eq(apikeyTable.id, row.id))
          .then(() => {})
          .catch(() => {})
        tryGetExecutionCtx(c)?.waitUntil(counterUpdate)

        const scopes = permissionsToStrings(row.permissions)
        // Audience is a grant attribute carried on the key's `metadata`, not
        // inferred from scopes (D3). Legacy keys with no audience default to
        // `staff`, preserving prior server-to-server behaviour. The actor
        // follows the audience so a non-staff key resolves to its own
        // visibility pool instead of silently gaining operator privileges.
        const audience = resolveApiKeyAudience(row.metadata)

        applyAuthContext(c, {
          organizationId: row.referenceId,
          scopes,
          callerType: "api_key",
          apiTokenId: row.id,
          apiKeyId: row.id,
          actor: audience,
          audience,
        })

        // `await` is load-bearing: with a bare `return next()` the
        // `finally` would run as soon as the downstream promise is
        // CREATED — releasing the shared client while the route is
        // still querying it. Awaiting keeps the release after the
        // entire downstream pipeline completes.
        return await next()
      } catch {
        // fall through to next strategy
      } finally {
        // The creating lease schedules pool teardown via waitUntil so
        // the worker stays alive for the close handshake; reuse leases
        // are no-ops.
        await lease.release()
      }
    }

    // Strategy 2b: MCP connector OAuth token. A chat assistant that completed
    // the consent flow presents an opaque OAuth access token — no `voy_`
    // prefix, so strategy 2 skips it. The grant is scoped to the MCP surface
    // alone: accepting it anywhere else under `/v1/admin/*` would turn a
    // narrow, operator-approved tool grant into a full admin credential.
    const isMcpApi = p === "/v1/admin/mcp" || p.startsWith("/v1/admin/mcp/")
    if (token && isMcpApi && opts?.auth?.resolveMcpToken) {
      const lease = acquireRequestDb(c, dbFactory)
      try {
        const resolved = await opts.auth.resolveMcpToken({
          request: c.req.raw,
          env: c.env,
          db: lease.db,
          // Guarded: Hono throws on `executionCtx` access outside Workers.
          ctx: tryGetExecutionCtx(c),
          token,
        })

        if (resolved?.actor) {
          applyAuthContext(c, resolved)
          // `await` is load-bearing — see strategy 2.
          return await next()
        }
      } finally {
        await lease.release()
      }
    }

    // Strategy 3: Remote app access token support. App grants authorize only
    // the installation-scoped App API; never resolve them on admin/public
    // surfaces where similarly named scopes may protect broader host routes.
    const isAppApi = p === "/v1/app" || p.startsWith("/v1/app/")
    if (token && isAppApi && opts?.auth?.resolveAppToken) {
      const lease = acquireRequestDb(c, dbFactory)
      try {
        const resolved = await opts.auth.resolveAppToken({
          request: c.req.raw,
          env: c.env,
          db: lease.db,
          // Guarded: Hono throws on `executionCtx` access outside Workers.
          ctx: tryGetExecutionCtx(c),
          token,
        })

        if (resolved?.callerType === "app" && resolved.appInstallationId) {
          applyAuthContext(c, resolved)
          // `await` is load-bearing — see strategy 2.
          return await next()
        }
      } finally {
        await lease.release()
      }
    }

    // Strategy 4: App-provided auth resolution (cookies, provider tokens, etc.)
    if (opts?.auth?.resolve) {
      const lease = acquireRequestDb(c, dbFactory)
      try {
        const resolved = await opts.auth.resolve({
          request: c.req.raw,
          env: c.env,
          db: lease.db,
          // Guarded: Hono throws on `executionCtx` access outside Workers.
          ctx: tryGetExecutionCtx(c),
        })

        if (resolved?.userId && matchesRequestRealm(p, resolved)) {
          applyAuthContext(c, resolved)
          // `await` is load-bearing — see strategy 2: a bare
          // `return next()` would let the `finally` release the shared
          // client while downstream is still using it.
          return await next()
        }
      } finally {
        await lease.release()
      }
    }

    // Strategy 5: Realm-bound session-claims bearer token support. Ambiguous
    // surfaces intentionally skip this strategy instead of trying both keys.
    const sessionRealm =
      p === "/v1/admin" || p.startsWith("/v1/admin/")
        ? "admin"
        : p === "/v1/public" || p.startsWith("/v1/public/")
          ? "customer"
          : null
    const adminSessionSecret = c.env.SESSION_CLAIMS_ADMIN_SECRET?.trim()
    const customerSessionSecret = c.env.SESSION_CLAIMS_CUSTOMER_SECRET?.trim()
    const sessionRootsAreDistinct =
      !adminSessionSecret || !customerSessionSecret || adminSessionSecret !== customerSessionSecret
    const sessionSecret = !sessionRootsAreDistinct
      ? undefined
      : sessionRealm === "admin"
        ? adminSessionSecret
        : sessionRealm === "customer"
          ? customerSessionSecret
          : undefined

    if (
      token &&
      sessionRealm &&
      sessionSecret &&
      sessionSecret.length >= 32 &&
      token.includes(".")
    ) {
      try {
        const sessionAuth = await verifySession(token, sessionSecret)

        applyAuthContext(c, {
          ...sessionAuth,
          realm: sessionRealm,
          callerType: "session",
          actor: sessionRealm === "admin" ? "staff" : "customer",
          audience: sessionRealm === "admin" ? "staff" : "customer",
        })

        return next()
      } catch {
        // fall through
      }
    }

    if (isAnonymousPath && isOptionalCustomerAuthPath) {
      c.set("isAnonymousRequest", true)
      return next()
    }

    if (opts?.auth?.onUnauthorized) {
      const response = await opts.auth.onUnauthorized({
        request: c.req.raw,
        env: c.env,
        // Guarded: Hono throws on `executionCtx` access outside Workers.
        ctx: tryGetExecutionCtx(c),
      })
      if (response) return response
    }

    // The MCP surface answers with an RFC 9728 challenge instead of a bare 401.
    // This is the first step of the connector handshake and the only thing that
    // tells a chat assistant where the authorization server lives: it dials the
    // pasted URL with no credential, reads `resource_metadata` off this header,
    // and follows it to discovery. Without the header the client has a 401 and
    // nowhere to go, so the whole flow is unreachable.
    if (isMcpApi) {
      return c.json({ error: "Unauthorized" }, 401, {
        "WWW-Authenticate": `Bearer resource_metadata="${mcpResourceMetadataUrl(c.req.url)}"`,
      })
    }

    return c.json({ error: "Unauthorized" }, 401)
  }
}

/**
 * Absolute URL of the protected-resource document named in the challenge.
 *
 * Built from the request's own origin rather than a configured base URL: the
 * client fetches exactly this URL, and the origin is the one piece of the
 * deployment's public address the middleware can always observe. The root form
 * is used because the API base path is already stripped by the time this
 * middleware runs, so a path-derived form would omit that prefix.
 */
function mcpResourceMetadataUrl(requestUrl: string): string {
  try {
    return `${new URL(requestUrl).origin}/.well-known/oauth-protected-resource`
  } catch {
    return "/.well-known/oauth-protected-resource"
  }
}
