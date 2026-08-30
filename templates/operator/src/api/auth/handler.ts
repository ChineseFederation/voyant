/**
 * Better Auth handler for Hono.
 *
 * Mounts Better Auth at /auth/* for authentication operations.
 * Same-origin — no CORS needed. Session cookies work naturally.
 *
 * Also provides /auth/status (user provisioning) and /auth/me (user info).
 */

import {
  createVoyantCloudAdminAuthPlugin,
  revalidateVoyantCloudAdminAuthSession,
  revalidateVoyantCloudAdminAuthUser,
} from "@voyantjs/auth/cloud-admin-session"
import {
  buildClearCloudAdminAuthStateCookie,
  createCloudAdminAuthStart,
} from "@voyantjs/auth/cloud-broker"
import { createBetterAuth, handleApiTokenManagementRequest } from "@voyantjs/auth/server"
import { ensureCurrentUserProfile } from "@voyantjs/auth/workspace"
import { authUser, type SelectApikey, userProfilesTable } from "@voyantjs/db/schema/iam"
import type { VoyantDb, VoyantRequestAuthContext } from "@voyantjs/hono"
import { eq, sql } from "drizzle-orm"
import { type Context, Hono } from "hono"

import { resolveEmailReplyTo } from "../../lib/notifications"
import { tryGetCloudClient } from "../../lib/voyant-cloud"
import { dbFromEnvForApp } from "../lib/db"
import { validateTuyuAdministratorSession } from "../tuyu-admin-core"

// Type ctx so that `c.get("db")` resolves to the parent app's middleware-
// set `VoyantDb` (the per-request Pool the `dbFromEnvForApp` factory
// installed). Without this, the sub-app sees `unknown` for context vars.
type AuthHonoEnv = { Bindings: CloudflareBindings; Variables: { db: VoyantDb } }
type OperatorAuthMode = "local" | "voyant-cloud"

const auth = new Hono<AuthHonoEnv>()
const DEFAULT_APP_URL = "http://localhost:3300"
const CLOUD_BETTER_AUTH_ALLOWLIST = new Set([
  "/auth/get-session",
  "/auth/jwks",
  "/auth/session",
  "/auth/sign-out",
  "/auth/token",
])

function resolveOperatorAuthMode(env: CloudflareBindings): OperatorAuthMode {
  const mode = env.VOYANT_ADMIN_AUTH_MODE?.trim() || "local"

  if (mode === "local" || mode === "voyant-cloud") {
    return mode
  }

  console.error(`[auth] Invalid VOYANT_ADMIN_AUTH_MODE="${mode}". Failing closed as voyant-cloud.`)
  return "voyant-cloud"
}

function isVoyantCloudAuthMode(env: CloudflareBindings): boolean {
  return resolveOperatorAuthMode(env) === "voyant-cloud"
}

function isCloudAllowedBetterAuthRoute(request: Request): boolean {
  const url = new URL(request.url)
  const pathname = url.pathname.replace(/\/+$/, "") || "/"
  return CLOUD_BETTER_AUTH_ALLOWLIST.has(pathname)
}

function localAuthDisabledResponse(c: Context<AuthHonoEnv>) {
  return c.json({ error: "Local auth routes are disabled in Voyant Cloud auth mode" }, 404)
}

function cloudAuthNotConfiguredResponse(c: Context<AuthHonoEnv>) {
  return c.json({ error: "Voyant Cloud auth broker is not configured yet" }, 501)
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, "")
}

function getAppUrl(env: CloudflareBindings): string {
  const candidates = [
    env.APP_URL,
    env.DASH_BASE_URL,
    env.CORS_ALLOWLIST?.split(",")[0],
    DEFAULT_APP_URL,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return normalizeUrl(candidate)
    }
  }

  return DEFAULT_APP_URL
}

function getTrustedOrigins(env: CloudflareBindings): string[] {
  return Array.from(
    new Set(
      [env.APP_URL, env.DASH_BASE_URL, ...(env.CORS_ALLOWLIST ?? "").split(",")]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).map(normalizeUrl)
}

function getAuthBaseUrl(env: CloudflareBindings): string {
  // entry.ts strips /api before delegating to the Hono app, so Better Auth
  // sees paths like /auth/*. Its baseURL must be the origin only (no /api).
  const appUrl = getAppUrl(env)
  try {
    const parsed = new URL(appUrl)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return appUrl
  }
}

function getPublicApiBaseUrl(env: CloudflareBindings): string {
  const candidate = env.API_BASE_URL?.trim() || env.APP_URL?.trim() || `${getAppUrl(env)}/api`
  const normalized = normalizeUrl(candidate)

  try {
    const parsed = new URL(normalized)
    if (parsed.pathname === "/" || parsed.pathname === "") {
      parsed.pathname = "/api"
      return normalizeUrl(parsed.toString())
    }
  } catch {
    return normalized
  }

  return normalized
}

function getCloudAuthStartConfig(env: CloudflareBindings) {
  const deploymentId = env.VOYANT_CLOUD_DEPLOYMENT_ID?.trim()
  const cloudAuthStartUrl = env.VOYANT_CLOUD_ADMIN_AUTH_START_URL?.trim()
  if (!deploymentId || !cloudAuthStartUrl) return null

  return {
    cloudAuthStartUrl,
    deploymentId,
    adminCallbackUrl: `${getPublicApiBaseUrl(env)}/auth/cloud/callback`,
    cookieSecret: env.SESSION_CLAIMS_SECRET,
    appId: env.VOYANT_CLOUD_APP_ID?.trim() || undefined,
    environment: env.VOYANT_CLOUD_ENVIRONMENT?.trim() || undefined,
  }
}

function getCloudAuthExchangeConfig(env: CloudflareBindings) {
  const deploymentId = env.VOYANT_CLOUD_DEPLOYMENT_ID?.trim()
  const exchangeUrl = env.VOYANT_CLOUD_ADMIN_AUTH_EXCHANGE_URL?.trim()
  const assertionJwksUrl = env.VOYANT_CLOUD_ADMIN_AUTH_JWKS_URL?.trim()
  const clientToken = env.VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN?.trim()
  if (!deploymentId || !exchangeUrl || !assertionJwksUrl || !clientToken) return null

  return {
    exchangeUrl,
    deploymentId,
    clientToken,
    assertionJwksUrl,
    assertionAudience: env.VOYANT_CLOUD_ADMIN_AUTH_AUDIENCE?.trim() || deploymentId,
  }
}

function getCloudAuthRevalidateConfig(env: CloudflareBindings) {
  const deploymentId = env.VOYANT_CLOUD_DEPLOYMENT_ID?.trim()
  const revalidateUrl = env.VOYANT_CLOUD_ADMIN_AUTH_REVALIDATE_URL?.trim()
  const clientToken = env.VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN?.trim()
  if (!deploymentId || !revalidateUrl || !clientToken) return null

  return {
    revalidateUrl,
    deploymentId,
    clientToken,
  }
}

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname
  return hostname === "127.0.0.1" || hostname === "localhost"
}

function useBrowserEvidenceAuthFallback(env: CloudflareBindings, request: Request): boolean {
  const bindings = env as unknown as Record<string, string | undefined>
  return bindings.VOYANT_OPERATOR_BROWSER_EVIDENCE === "1" && isLocalRequest(request)
}
/**
 * Build a Better Auth instance backed by a caller-provided drizzle
 * client. The caller owns the Pool lifecycle (open before, dispose
 * after) so the same Pool can serve both the auth lookup and any
 * subsequent queries the route does — without spinning up a second
 * connection per request.
 *
 * Cloudflare Workers isolate I/O per request — a DB connection created
 * in one request cannot be reused by another ("Cannot perform I/O on
 * behalf of a different request"). The auth instance is therefore not
 * cached either.
 */
export function buildBetterAuth(
  env: CloudflareBindings,
  db: ReturnType<typeof dbFromEnvForApp>["db"],
) {
  const cloud = tryGetCloudClient(env)
  const emailFrom = env.EMAIL_FROM || "Voyant <noreply@voyantcloud.app>"
  const emailReplyTo = resolveEmailReplyTo(env)
  const cloudAuthExchange = isVoyantCloudAuthMode(env) ? getCloudAuthExchangeConfig(env) : null
  const authDb = db as NonNullable<Parameters<typeof createBetterAuth>[0]>["db"]
  const cloudAuthDb = db as Parameters<typeof createVoyantCloudAdminAuthPlugin>[0]["db"]

  return createBetterAuth({
    // `db` is a `NeonDatabase` (neon-serverless WebSocket); the
    // `CreateBetterAuthOptions.db` type still references the older
    // `getDb` return union (postgres-js + neon-http). Drizzle's
    // PgDatabase surface is identical across flavors at runtime, so
    // the cast is structurally safe — better-auth's drizzleAdapter
    // works on any PgDatabase. See #500 for context.
    db: authDb,
    secret: env.SESSION_CLAIMS_SECRET,
    baseURL: getAuthBaseUrl(env),
    basePath: "/auth",
    trustedOrigins: getTrustedOrigins(env),
    plugins: cloudAuthExchange
      ? [
          createVoyantCloudAdminAuthPlugin({
            db: cloudAuthDb,
            cookieSecret: env.SESSION_CLAIMS_SECRET,
            exchange: cloudAuthExchange,
          }),
        ]
      : undefined,
    sendResetPassword: async ({ user, url }) => {
      if (!cloud) {
        console.info(`[auth] reset-password (no VOYANT_API_KEY) → ${user.email}: ${url}`)
        return
      }
      await cloud.email.sendMessage({
        from: emailFrom,
        to: [user.email],
        subject: "Reset your password",
        html: `<p>Hi ${user.name},</p><p>Click <a href="${url}">here</a> to reset your password.</p><p>If you didn't request this, you can safely ignore this email.</p>`,
        ...(emailReplyTo ? { replyTo: emailReplyTo } : {}),
      })
    },
    sendVerificationOTP: async ({ email, otp, type }) => {
      if (!cloud) {
        console.info(`[auth] verification-otp (no VOYANT_API_KEY) [${type}] → ${email}: ${otp}`)
        return
      }
      await cloud.email.sendMessage({
        from: emailFrom,
        to: [email],
        subject: type === "email-verification" ? "Verify your email" : "Your verification code",
        html: `<p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
        ...(emailReplyTo ? { replyTo: emailReplyTo } : {}),
      })
    },
  })
}

export async function resolveAuthRequest(
  request: Request,
  env: CloudflareBindings,
): Promise<VoyantRequestAuthContext | null> {
  const { db, dispose } = dbFromEnvForApp(env)
  try {
    const auth = buildBetterAuth(env, db)
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session) {
      return null
    }

    if (
      session.user.email === "tuyu-system-administrator@localhost" &&
      !(await validateTuyuAdministratorSession(env, session.session.id, request))
    ) {
      return null
    }

    if (isVoyantCloudAuthMode(env)) {
      const revalidateConfig = getCloudAuthRevalidateConfig(env)
      if (!revalidateConfig) {
        return null
      }

      try {
        const revalidation = await revalidateVoyantCloudAdminAuthSession({
          db: db as Parameters<typeof revalidateVoyantCloudAdminAuthSession>[0]["db"],
          sessionId: session.session.id,
          config: revalidateConfig,
        })

        if (!revalidation.ok) {
          return null
        }
      } catch (error) {
        console.error("[auth/session] Cloud revalidation failed:", error)
        return null
      }
    }

    return {
      userId: session.user.id,
      sessionId: session.session.id,
      organizationId: null,
      callerType: "session",
      actor: "staff",
      // Single-tenant operator: every authenticated session is staff with
      // full access. Without "*", capabilities that gate on explicit
      // grants (e.g. bookings-pii:read) reject the reveal endpoint and
      // surface as "Forbidden" in the dashboard.
      scopes: ["*"],
      email: session.user.email ?? null,
    }
  } finally {
    // No `executionCtx` reachable here (called from middleware that
    // doesn't pass one through). Await inline so the WebSocket closes
    // before this fn returns.
    await dispose()
  }
}

/**
 * Single-tenant: every authenticated session is a staff user with full access.
 * When `resolveAuthRequest` has already granted a session, permissions are
 * implicitly allowed. If you need granular RBAC later, switch on
 * `user_profiles.isSuperAdmin` / `isSupportUser` here.
 */
export async function hasAuthPermission(
  request: Request,
  env: CloudflareBindings,
): Promise<boolean> {
  const auth = await resolveAuthRequest(request, env)
  return auth !== null
}

export async function validateApiTokenAccess(
  env: CloudflareBindings,
  db: VoyantDb,
  apiKey: SelectApikey,
): Promise<boolean> {
  if (!isVoyantCloudAuthMode(env)) return true

  const revalidateConfig = getCloudAuthRevalidateConfig(env)
  if (!revalidateConfig) return false

  try {
    const revalidation = await revalidateVoyantCloudAdminAuthUser({
      db: db as unknown as Parameters<typeof revalidateVoyantCloudAdminAuthUser>[0]["db"],
      userId: apiKey.referenceId,
      config: revalidateConfig,
    })
    return revalidation.ok
  } catch (error) {
    console.error("[auth/api-token] Cloud revalidation failed:", error)
    return false
  }
}

/**
 * GET /auth/me
 * Returns the current authenticated user's profile.
 * Validates the session cookie directly (no Bearer token needed).
 */
auth.get("/auth/me", async (c) => {
  if (useBrowserEvidenceAuthFallback(c.env, c.req.raw)) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  // The auth sub-app is mounted before the request-scoped `db`
  // middleware in `createApp` (auth routes are public — no requireAuth
  // gate), so `c.var.db` is undefined here. Build the per-request Pool
  // ourselves and use it for both better-auth's session lookup and
  // the profile query that follows.
  const { db, dispose } = dbFromEnvForApp(c.env)
  try {
    const betterAuth = buildBetterAuth(c.env, db)
    const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    const [row] = await db
      .select({
        id: authUser.id,
        email: authUser.email,
        createdAt: authUser.createdAt,
        firstName: userProfilesTable.firstName,
        lastName: userProfilesTable.lastName,
        locale: userProfilesTable.locale,
        timezone: userProfilesTable.timezone,
        uiPrefs: userProfilesTable.uiPrefs,
        avatarUrl: userProfilesTable.avatarUrl,
        isSuperAdmin: userProfilesTable.isSuperAdmin,
        isSupportUser: userProfilesTable.isSupportUser,
      })
      .from(authUser)
      .leftJoin(userProfilesTable, eq(userProfilesTable.id, authUser.id))
      .where(eq(authUser.id, session.user.id))
      .limit(1)

    if (!row) {
      return c.json({ error: "User not found" }, 404)
    }

    return c.json({
      id: row.id,
      email: row.email,
      firstName: row.firstName ?? null,
      lastName: row.lastName ?? null,
      locale: row.locale ?? "en",
      timezone: row.timezone ?? null,
      uiPrefs: (row.uiPrefs as Record<string, unknown> | null) ?? null,
      isSuperAdmin: row.isSuperAdmin ?? false,
      isSupportUser: row.isSupportUser ?? false,
      createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
      profilePictureUrl: row.avatarUrl ?? null,
    })
  } finally {
    // Schedule dispose AFTER queries settle. waitUntil keeps the
    // worker alive while the WebSocket close handshake completes.
    c.executionCtx.waitUntil(dispose())
  }
})

/**
 * GET /auth/status
 * Ensures the authenticated user has a user_profiles row.
 * Profile is normally created by the BA databaseHook on sign-up,
 * but this route serves as an idempotent fallback.
 */
auth.get("/auth/status", async (c) => {
  // See `/auth/me` above — auth sub-app runs before the request `db`
  // middleware, so own the Pool here.
  const { db, dispose } = dbFromEnvForApp(c.env)
  try {
    const betterAuth = buildBetterAuth(c.env, db)
    const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
    if (!session) {
      return c.json({ userExists: false, authenticated: false })
    }

    const userId = session.user.id

    const status = await ensureCurrentUserProfile(
      db as Parameters<typeof ensureCurrentUserProfile>[0],
      userId,
    )
    if (!status.userExists && status.authenticated) {
      console.error("[auth/status] Error:", status.reason)
      return c.json(status, 500)
    }

    return c.json(status)
  } finally {
    c.executionCtx.waitUntil(dispose())
  }
})

/**
 * GET /auth/bootstrap-status
 * Public endpoint — reveals whether any user exists. Used by the sign-in /
 * sign-up route loaders to pick the right flow.
 */
auth.get("/auth/bootstrap-status", async (c) => {
  if (useBrowserEvidenceAuthFallback(c.env, c.req.raw)) {
    return c.json({ hasUsers: true })
  }

  if (isVoyantCloudAuthMode(c.env)) {
    return c.json({ hasUsers: true, authMode: "voyant-cloud" })
  }

  // See `/auth/me` above — auth sub-app runs before the request `db`
  // middleware, so own the Pool here.
  const { db, dispose } = dbFromEnvForApp(c.env)
  try {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(authUser)
    return c.json({ hasUsers: (row?.count ?? 0) > 0, authMode: "local" })
  } finally {
    c.executionCtx.waitUntil(dispose())
  }
})

async function handleApiTokensFacade(c: Context<AuthHonoEnv>) {
  const { db, dispose } = dbFromEnvForApp(c.env)
  try {
    const betterAuth = buildBetterAuth(c.env, db)
    const cloudAuthDb = db as Parameters<typeof revalidateVoyantCloudAdminAuthSession>[0]["db"]

    if (isVoyantCloudAuthMode(c.env)) {
      const revalidateConfig = getCloudAuthRevalidateConfig(c.env)
      if (!revalidateConfig) {
        return c.json(
          { error: "Cloud-mode API token management requires membership revalidation" },
          501,
        )
      }

      const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
      if (!session) {
        return c.json({ error: "Unauthorized" }, 401)
      }

      try {
        const revalidation = await revalidateVoyantCloudAdminAuthSession({
          db: cloudAuthDb,
          sessionId: session.session.id,
          config: revalidateConfig,
        })

        if (!revalidation.ok) {
          return c.json({ error: "Voyant Cloud access revoked" }, 403)
        }
      } catch (error) {
        console.error("[auth/api-tokens] Cloud revalidation failed:", error)
        return c.json({ error: "Voyant Cloud access could not be revalidated" }, 503)
      }
    }

    return (
      (await handleApiTokenManagementRequest(c.req.raw, betterAuth, {
        db,
      })) ?? c.json({ error: "Not found" }, 404)
    )
  } finally {
    c.executionCtx.waitUntil(dispose())
  }
}

auth.get("/auth/cloud/start", async (c) => {
  if (!isVoyantCloudAuthMode(c.env)) {
    return c.json({ error: "Not found" }, 404)
  }

  const config = getCloudAuthStartConfig(c.env)
  if (!config) {
    return cloudAuthNotConfiguredResponse(c)
  }

  try {
    const start = await createCloudAdminAuthStart({
      requestUrl: c.req.url,
      next: c.req.query("next"),
      config,
    })
    return new Response(null, {
      status: 302,
      headers: {
        Location: start.redirectUrl,
        "Set-Cookie": start.setCookie,
      },
    })
  } catch (error) {
    console.error("[auth/cloud/start] Error:", error)
    return c.json({ error: "Voyant Cloud auth broker is misconfigured" }, 500)
  }
})

auth.get("/auth/cloud/callback", async (c) => {
  if (!isVoyantCloudAuthMode(c.env)) {
    return c.json({ error: "Not found" }, 404)
  }

  const exchangeConfig = getCloudAuthExchangeConfig(c.env)
  if (!exchangeConfig) {
    const url = new URL(c.req.url)
    return c.json({ error: "Voyant Cloud auth exchange is not configured yet" }, 501, {
      "Set-Cookie": buildClearCloudAdminAuthStateCookie(
        url.protocol === "https:",
        url.pathname.replace(/\/callback$/, "") || "/auth/cloud",
      ),
    })
  }

  const { db, dispose } = dbFromEnvForApp(c.env)
  try {
    const betterAuth = buildBetterAuth(c.env, db)
    return await betterAuth.handler(c.req.raw)
  } catch (error) {
    console.error("[auth/cloud/callback] Error:", error)
    return c.json({ error: "Voyant Cloud auth callback failed" }, 500)
  } finally {
    c.executionCtx.waitUntil(dispose())
  }
})

auth.all("/auth/api-tokens", handleApiTokensFacade)
auth.all("/auth/api-tokens/:keyId", handleApiTokensFacade)
auth.all("/auth/api-tokens/:keyId/rotate", handleApiTokensFacade)

/**
 * Catch-all: delegate to Better Auth handler.
 * Handles sign-in, sign-up, sign-out, password reset, OAuth callbacks, etc.
 *
 * Sign-up is gated by a `user.create.before` hook in @voyantjs/auth — once a
 * user exists, the hook throws and BA returns an error to the client.
 */
auth.all("/auth/*", async (c) => {
  if (isVoyantCloudAuthMode(c.env) && !isCloudAllowedBetterAuthRoute(c.req.raw)) {
    return localAuthDisabledResponse(c)
  }

  const { db, dispose } = dbFromEnvForApp(c.env)
  try {
    const betterAuth = buildBetterAuth(c.env, db)
    return await betterAuth.handler(c.req.raw)
  } finally {
    c.executionCtx.waitUntil(dispose())
  }
})

export default auth
