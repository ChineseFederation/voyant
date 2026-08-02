/**
 * Better Auth Node runtime for Hono.
 *
 * agent-quality: file-size exception -- Auth handler keeps local and Voyant Cloud auth flows co-located until the route surface is split by auth mode.
 *
 * Mounts Better Auth at /auth/admin/* and /auth/customer/*.
 * Same-origin — no CORS needed. Session cookies work naturally.
 *
 * Also provides /auth/status (user provisioning) and /auth/me (user info).
 */

import { oauthProvider } from "@better-auth/oauth-provider"
import type { VoyantAuthContext } from "@voyant-travel/core"
import { type NodeDatabaseEnv, openNodeDatabase } from "@voyant-travel/db/runtime"
import {
  authUser,
  oauthConsentTable,
  type SelectApikey,
  userProfilesTable,
} from "@voyant-travel/db/schema/iam"
import {
  parseJsonBody,
  type Reporter,
  type VoyantDb,
  type VoyantResolvedSessionAuthContext,
} from "@voyant-travel/hono"
import {
  handleApiError,
  reportException,
  requestId,
} from "@voyant-travel/hono/middleware/error-boundary"
import { getRequestId } from "@voyant-travel/hono/observability"
import type { AccessCatalog } from "@voyant-travel/types/api-keys"
import { verifyAccessToken } from "better-auth/oauth2"
import { jwt } from "better-auth/plugins"
import { and, eq, sql } from "drizzle-orm"

/**
 * Discovery documents are fetched cross-origin by MCP clients before any
 * credential exists, and they are public by definition — no auth, no secrets.
 */
const OAUTH_DISCOVERY_HEADERS = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300",
} as const

import { type Context, Hono } from "hono"
import { z } from "zod"
import {
  createVoyantCloudAdminAuthPlugin,
  revalidateVoyantCloudAdminAuthSession,
  revalidateVoyantCloudAdminAuthUser,
} from "./cloud-admin-session.js"
import { buildClearCloudAdminAuthStateCookie, createCloudAdminAuthStart } from "./cloud-broker.js"
import {
  type CustomerBusinessAccountDto,
  customerBusinessAccountCreateInputSchema,
  customerBusinessAccountRequestCreateInputSchema,
  customerBusinessAccountRequestListQuerySchema,
  customerBusinessInvitationAcceptInputSchema,
} from "./customer-business-accounts-contracts.js"
import type { CustomerBusinessAccountOnboardingRuntimeProvider } from "./customer-business-onboarding-runtime-port.js"
import {
  CustomerBusinessOnboardingConflictError,
  CustomerBusinessOnboardingNotFoundError,
} from "./customer-business-onboarding-service.js"
import {
  type CustomerBuyerAccountPolicy,
  createDrizzleCustomerBuyerAccountStore,
  listCustomerBuyerAccounts,
  normalizeCustomerBuyerAccountPolicy,
  repairCustomerPersonalBuyerAccountEntitlement,
  resolveActiveCustomerBuyerContext,
  selectCustomerBuyerAccount,
} from "./customer-buyer-accounts.js"
import {
  mcpOAuthProviderConfig,
  mcpProtectedResourceMetadata,
  parseOAuthScopeClaim,
  resolveMcpGrantScopes,
  withPublicApiEndpoints,
} from "./mcp-oauth.js"
import {
  type CreateBetterAuthOptions,
  type CustomerAuthMethods,
  createAdminBetterAuth,
  createCustomerBetterAuth,
  handleApiTokenManagementRequest,
  handleOrganizationMembersRequest,
} from "./server.js"
import { resolveStaffAccess } from "./staff-access.js"
import { StorefrontCustomerAuthResolutionError } from "./storefront-customer-auth-resolver.js"
import { ensureCurrentUserProfile } from "./workspace.js"

// Type ctx so that `c.get("db")` resolves to the parent app's middleware-
// set `VoyantDb` from the deployment's database lifecycle adapter. Without
// this, the sub-app sees `unknown` for context vars.
type OperatorAuthMode = "local" | "voyant-cloud"
type OperatorApiAuthSurface = "admin" | "customer"

function classifyOperatorApiAuthSurface(requestUrl: string): OperatorApiAuthSurface | null {
  const pathname = new URL(requestUrl).pathname.replace(/\/+$/, "") || "/"
  const normalized = pathname.startsWith("/api/") ? pathname.slice(4) : pathname
  if (normalized === "/v1/admin" || normalized.startsWith("/v1/admin/")) return "admin"
  if (normalized === "/v1/public" || normalized.startsWith("/v1/public/")) return "customer"
  return null
}

/**
 * Whether a request targets the customer realm surface eligible for per-storefront
 * dynamic CORS: the public storefront API (`/v1/public` + `/v1/public/*`) and the
 * customer auth routes (`/auth/customer` + `/auth/customer/*`) a direct client
 * hits to sign in. Tolerates an optional `/api` host prefix. Admin/dash surfaces
 * are intentionally excluded — they keep the static `CORS_ALLOWLIST` behavior.
 */
export function isCustomerCorsSurface(requestUrl: string): boolean {
  const pathname = new URL(requestUrl).pathname.replace(/\/+$/, "") || "/"
  const normalized = pathname.startsWith("/api/") ? pathname.slice(4) : pathname
  return (
    normalized === "/v1/public" ||
    normalized.startsWith("/v1/public/") ||
    normalized === "/auth/customer" ||
    normalized.startsWith("/auth/customer/")
  )
}

export interface OperatorAuthNodeEnv extends NodeDatabaseEnv {
  API_BASE_URL?: string
  APP_URL?: string
  AUTH_COOKIE_DOMAIN?: string
  BETTER_AUTH_ADMIN_SECRET?: string
  BETTER_AUTH_CUSTOMER_SECRET?: string
  CORS_ALLOWLIST?: string
  DASH_BASE_URL?: string
  EMAIL_FROM?: string
  SESSION_CLAIMS_ADMIN_SECRET: string
  SESSION_CLAIMS_CUSTOMER_SECRET?: string
  VOYANT_ADMIN_AUTH_MODE?: string
  VOYANT_CUSTOMER_AUTH_MODE?: string
  VOYANT_CUSTOMER_AUTH_CONFIG_JSON?: string
  VOYANT_CUSTOMER_AUTH_EMAIL_CODE?: string
  VOYANT_CUSTOMER_AUTH_EMAIL_PASSWORD?: string
  CUSTOMER_AUTH_GOOGLE_CLIENT_ID?: string
  CUSTOMER_AUTH_GOOGLE_CLIENT_SECRET?: string
  CUSTOMER_AUTH_FACEBOOK_CLIENT_ID?: string
  CUSTOMER_AUTH_FACEBOOK_CLIENT_SECRET?: string
  CUSTOMER_AUTH_APPLE_CLIENT_ID?: string
  CUSTOMER_AUTH_APPLE_CLIENT_SECRET?: string
  CUSTOMER_STOREFRONT_ORIGIN?: string
  VOYANT_AUTH_LOG_SECRET_FALLBACKS?: string
  VOYANT_CLOUD_ADMIN_AUTH_AUDIENCE?: string
  VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN?: string
  VOYANT_CLOUD_ADMIN_AUTH_EXCHANGE_URL?: string
  VOYANT_CLOUD_ADMIN_AUTH_JWKS_URL?: string
  VOYANT_CLOUD_ADMIN_AUTH_REVALIDATE_URL?: string
  VOYANT_CLOUD_ADMIN_AUTH_START_URL?: string
  VOYANT_CLOUD_APP_ID?: string
  VOYANT_CLOUD_DEPLOYMENT_ID?: string
  VOYANT_CLOUD_ENVIRONMENT?: string
  VOYANT_OPERATOR_BROWSER_EVIDENCE?: string
}

export interface OperatorCurrentUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  locale: string
  timezone: string | null
  uiPrefs: unknown
  isSuperAdmin: boolean
  isSupportUser: boolean
  createdAt: string
  profilePictureUrl: string | null
}

export type OperatorAuthBootstrapStatus = {
  hasUsers: boolean
  authMode?: OperatorAuthMode
  /** Active deployment modules used by source-free managed admin composition. */
  modules?: string[]
}

type BetterAuthAdvancedOptions = NonNullable<CreateBetterAuthOptions["advanced"]>

/** Resolve Better Auth's standard cross-subdomain cookie policy for Node hosts. */
export function buildBetterAuthCookieAdvancedOptions(
  env: Pick<OperatorAuthNodeEnv, "AUTH_COOKIE_DOMAIN">,
):
  | Pick<BetterAuthAdvancedOptions, "crossSubDomainCookies" | "defaultCookieAttributes">
  | undefined {
  const domain = env.AUTH_COOKIE_DOMAIN?.trim()
  if (!domain) return undefined

  return {
    crossSubDomainCookies: { enabled: true, domain },
    defaultCookieAttributes: { domain },
  }
}

export interface OperatorAuthEmailSender {
  sendResetPassword: (input: {
    user: { email: string; name: string }
    url: string
  }) => Promise<void>
  sendVerificationOtp: (input: { email: string; otp: string; type: string }) => Promise<void>
  sendCustomerOrganizationInvitation: (input: {
    email: string
    organizationName: string
    inviterName: string
    role: string
    url: string
  }) => Promise<void>
}

export interface CreateOperatorAuthNodeRuntimeOptions<Env extends OperatorAuthNodeEnv> {
  accessCatalog: AccessCatalog
  /** Active deployment modules surfaced by `/auth/bootstrap-status`. */
  activeModules?: readonly string[]
  appName: string
  authMode: OperatorAuthMode
  reporter: Reporter
  openDatabase?: (env: Env) => { db: VoyantDb; dispose: () => Promise<void> }
  cookieAdvanced?: (
    env: Env,
  ) =>
    | Pick<BetterAuthAdvancedOptions, "crossSubDomainCookies" | "defaultCookieAttributes">
    | undefined
  resolveEmailSender?: (env: Env) => OperatorAuthEmailSender | null
  customerBusinessAccountOnboarding?: CustomerBusinessAccountOnboardingRuntimeProvider
  /**
   * Storefront/BFF seam for a canonical public auth origin and resolved
   * merchant credentials. Never derive these values from Host/X-Forwarded-Host.
   */
  resolveCustomerAuthContext?: (
    env: Env,
    request: Request,
  ) => CustomerAuthRuntimeContext | Promise<CustomerAuthRuntimeContext>
  /**
   * Request-time dynamic-CORS origin authorizer for the customer realm
   * (`/v1/public/*` + `/auth/customer/*`). Returns the exact request origin to
   * echo in `Access-Control-Allow-Origin` when a storefront authorizes it, or
   * `null` to omit CORS headers. Authorizes keyed requests by the presented
   * storefront key and keyless preflight by the declared allowed origins. When
   * unset, the customer realm keeps the static `CORS_ALLOWLIST` behavior.
   */
  resolveCustomerCorsOrigin?: (env: Env, request: Request) => Promise<string | null>
}

export interface CustomerAuthRuntimeContext {
  /** Browser-visible proxy base used by storefront/BFF auth callbacks. */
  publicApiBaseURL?: string
  /** Canonical origin used internally by Better Auth. */
  baseURL: string
  /** Explicit trusted storefront origin used for customer invitation links and request audit. */
  invitationAcceptBaseURL?: string
  trustedOrigins: string[]
  /**
   * Full declared browser origins for the resolved storefront (exact +
   * `https://*.host` wildcard). Carried for dynamic CORS; `trustedOrigins` is
   * the canonical-origin subset Better Auth validates.
   */
  allowedOrigins?: string[]
  methods: CustomerAuthMethods
  /** Buyer capabilities are independent from identity sign-up methods. */
  accountPolicy?: CustomerBuyerAccountPolicy | null
  /** Server-derived Storefront sales-channel context for downstream public routes. */
  storefrontChannel?: {
    storefrontId: string
    channelId: string
    channelStatus?: string | null
  }
}

export interface CustomerAuthSocialPolicy {
  enabled: boolean
  credentialRef: string | null
}

export interface CustomerAuthPolicy {
  methods: {
    emailCode: boolean
    emailPassword: boolean
    google: CustomerAuthSocialPolicy
    facebook: CustomerAuthSocialPolicy
    apple: CustomerAuthSocialPolicy
  }
  accountPolicy: CustomerBuyerAccountPolicy
}

/**
 * Better Auth is dispatched internally without the hosting `/api` prefix, but
 * OAuth providers must return to the browser-visible route. Keep explicit
 * merchant overrides and supply the canonical public callback otherwise.
 */
export function withCustomerSocialRedirectUris(
  methods: CustomerAuthMethods,
  publicApiBaseUrl: string,
): CustomerAuthMethods {
  const providers = methods.socialProviders
  if (!providers) return methods

  const normalizedPublicApiBaseUrl = publicApiBaseUrl.replace(/\/+$/, "")
  const callback = (provider: "google" | "facebook" | "apple") =>
    `${normalizedPublicApiBaseUrl}/auth/customer/callback/${provider}`
  const withRedirectUri = <Provider>(
    provider: Provider | undefined,
    redirectURI: string,
  ): Provider | undefined => {
    if (!provider || typeof provider !== "object") return provider
    const configured = provider as Provider & { redirectURI?: string }
    return {
      ...configured,
      redirectURI: configured.redirectURI?.trim() || redirectURI,
    }
  }

  return {
    ...methods,
    socialProviders: {
      ...providers,
      ...(providers.google
        ? {
            google: withRedirectUri(providers.google, callback("google")),
          }
        : {}),
      ...(providers.facebook
        ? {
            facebook: withRedirectUri(providers.facebook, callback("facebook")),
          }
        : {}),
      ...(providers.apple
        ? {
            apple: withRedirectUri(providers.apple, callback("apple")),
          }
        : {}),
    },
  }
}

/**
 * Rewrite Better Auth's internally generated customer password-reset URL to
 * the browser-visible storefront/BFF API base.
 */
export function withCustomerPublicResetPasswordUrl(
  generatedUrl: string,
  publicApiBaseURL: string,
): string {
  try {
    const generated = new URL(generatedUrl)
    const publicApi = new URL(publicApiBaseURL)
    const apiPath = publicApi.pathname.replace(/\/+$/, "")
    publicApi.pathname = `${apiPath}${generated.pathname}`
    publicApi.search = generated.search
    publicApi.hash = generated.hash
    return publicApi.toString()
  } catch {
    return generatedUrl
  }
}

export function customerOrganizationInvitationUrl(
  invitationAcceptBaseURL: string,
  invitationId: string,
): string {
  const base = new URL(invitationAcceptBaseURL)
  if (
    (base.protocol !== "http:" && base.protocol !== "https:") ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  ) {
    throw new Error("invitationAcceptBaseURL must be an exact trusted HTTP(S) origin")
  }
  base.pathname = `/account/business-invitations/${encodeURIComponent(invitationId)}`
  return base.toString()
}

export function createOperatorAuthNodeRuntime<Env extends OperatorAuthNodeEnv>(
  runtimeOptions: CreateOperatorAuthNodeRuntimeOptions<Env>,
) {
  type AuthHonoEnv = { Bindings: Env; Variables: { db: VoyantDb } }

  const openDatabase =
    runtimeOptions.openDatabase ??
    ((env: Env) => {
      const resource = openNodeDatabase(env)
      return { db: resource.db as VoyantDb, dispose: resource.dispose }
    })

  const auth = new Hono<AuthHonoEnv>()
  // This lean auth app is dispatched around `createVoyantApp` (see
  // api-dispatch.ts), so it must mint/propagate the correlation id and wire
  // the reporter itself — otherwise auth 5xx are an observability blind spot and
  // the user-facing requestId wouldn't be findable (RFC voyant#1553).
  auth.use("*", requestId)
  // `onError` only fires on THROWN exceptions. Several handlers (e.g.
  // /auth/status, the cloud token/revalidate/callback paths) instead RETURN a
  // 5xx via `c.json(..., 50x)`; those bypass `onError`, and this lean app is
  // dispatched around `createVoyantApp` so the framework's auth status-bridge
  // (`mountAuthForwarding`) never runs either. Bridge returned 5xx to the
  // reporter here so they aren't an observability blind spot (RFC voyant#1553).
  // Thrown errors skip this middleware's post-`next()` code (the rejection
  // propagates straight to `onError`), so there's no double report.
  auth.use("*", async (c, next) => {
    await next()
    if (c.res.status >= 500) {
      reportException(runtimeOptions.reporter, c, {
        requestId: getRequestId() ?? "",
        app: runtimeOptions.appName,
        error: new Error(`auth handler returned HTTP ${c.res.status}`),
        context: { path: c.req.path, method: c.req.method, status: c.res.status, surface: "auth" },
      })
    }
  })
  auth.onError((err, c) => {
    // A storefront customer-auth resolution failure is a client-side auth
    // failure (missing/invalid storefront key or a disallowed origin), not a
    // server fault. Translate it into a clean 401/403 with a stable, non-leaky
    // body instead of letting it fall through to `handleApiError`'s 500. The
    // catch is narrowed to this error type so genuine server faults still 500.
    if (err instanceof StorefrontCustomerAuthResolutionError) {
      c.header("Cache-Control", "no-store")
      return c.json({ error: err.code }, err.status)
    }
    return handleApiError(err, c, {
      reporter: runtimeOptions.reporter,
      appName: runtimeOptions.appName,
    })
  })

  const DEFAULT_APP_URL = "http://localhost:3300"
  const CLOUD_BETTER_AUTH_ALLOWLIST = new Set([
    "/auth/get-session",
    "/auth/jwks",
    "/auth/session",
    "/auth/sign-out",
    "/auth/token",
    // MCP connector OAuth. Managed deployments broker staff sessions through
    // Voyant Cloud, but the authorization server issuing connector grants is
    // local to the deployment — discovery advertises it in every mode, so these
    // must stay reachable or a managed operator gets a 404 the moment they try
    // to connect an assistant.
    "/auth/.well-known/oauth-authorization-server",
    "/auth/oauth2/authorize",
    "/auth/oauth2/consent",
    "/auth/oauth2/delete-consent",
    "/auth/oauth2/get-client",
    "/auth/oauth2/get-consents",
    "/auth/oauth2/public-client",
    "/auth/oauth2/register",
    "/auth/oauth2/revoke",
    "/auth/oauth2/token",
  ])

  function resolveOperatorAuthMode(_env: Env): OperatorAuthMode {
    return runtimeOptions.authMode
  }

  function isVoyantCloudAuthMode(env: Env): boolean {
    return resolveOperatorAuthMode(env) === "voyant-cloud"
  }

  function isCloudAllowedBetterAuthRoute(request: Request): boolean {
    const url = new URL(request.url)
    const pathname = url.pathname.replace("/auth/admin", "/auth").replace(/\/+$/, "") || "/"
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

  function getAppUrl(env: Env): string {
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

  function getTrustedOrigins(env: Env): string[] {
    return Array.from(
      new Set(
        [env.APP_URL, env.DASH_BASE_URL, ...(env.CORS_ALLOWLIST ?? "").split(",")]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).map(normalizeUrl)
  }

  function getAuthBaseUrl(env: Env): string {
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

  function getPublicApiBaseUrl(env: Env): string {
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

  function getCloudAuthStartConfig(env: Env) {
    const deploymentId = env.VOYANT_CLOUD_DEPLOYMENT_ID?.trim()
    const cloudAuthStartUrl = env.VOYANT_CLOUD_ADMIN_AUTH_START_URL?.trim()
    if (!deploymentId || !cloudAuthStartUrl) return null

    return {
      cloudAuthStartUrl,
      deploymentId,
      adminCallbackUrl: `${getPublicApiBaseUrl(env)}/auth/admin/cloud/callback`,
      cookieSecret: env.SESSION_CLAIMS_ADMIN_SECRET,
      appId: env.VOYANT_CLOUD_APP_ID?.trim() || undefined,
      environment: env.VOYANT_CLOUD_ENVIRONMENT?.trim() || undefined,
    }
  }

  function getCloudAuthExchangeConfig(env: Env) {
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

  function getCloudAuthRevalidateConfig(env: Env) {
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

  function shouldUseBrowserEvidenceAuthFallback(env: Env, request: Request): boolean {
    return env.VOYANT_OPERATOR_BROWSER_EVIDENCE === "1" && isLocalRequest(request)
  }

  function allowAuthSecretLogging(env: Env): boolean {
    return env.VOYANT_AUTH_LOG_SECRET_FALLBACKS === "1"
  }

  /**
   * Build a Better Auth instance backed by a caller-provided drizzle
   * client. The caller owns the Pool lifecycle (open before, dispose
   * after) so the same Pool can serve both the auth lookup and any
   * subsequent queries the route does — without spinning up a second
   * connection per request.
   *
   * The deployment decides whether this is a request-scoped or resident Node
   * pool. The Better Auth instance is not cached independently of that owner.
   */
  function requireAdminAuthSecret(env: Env): string {
    const secret = env.BETTER_AUTH_ADMIN_SECRET?.trim()
    if (!secret) throw new Error("Admin auth requires BETTER_AUTH_ADMIN_SECRET")
    return secret
  }

  function requireCustomerAuthSecret(env: Env): string {
    const secret = env.BETTER_AUTH_CUSTOMER_SECRET?.trim()
    if (!secret) throw new Error("Customer auth requires BETTER_AUTH_CUSTOMER_SECRET")
    return secret
  }

  function envEnabled(value: string | undefined, fallback: boolean): boolean {
    const normalized = value?.trim().toLowerCase()
    if (!normalized) return fallback
    return normalized === "1" || normalized === "true" || normalized === "yes"
  }

  function parseCustomerAuthPolicy(env: Env): CustomerAuthPolicy {
    const fallback = {
      methods: {
        emailCode: envEnabled(env.VOYANT_CUSTOMER_AUTH_EMAIL_CODE, true),
        emailPassword: envEnabled(env.VOYANT_CUSTOMER_AUTH_EMAIL_PASSWORD, true),
        google: { enabled: false, credentialRef: null },
        facebook: { enabled: false, credentialRef: null },
        apple: { enabled: false, credentialRef: null },
      },
      accountPolicy: normalizeCustomerBuyerAccountPolicy(),
    } satisfies CustomerAuthPolicy
    const raw = env.VOYANT_CUSTOMER_AUTH_CONFIG_JSON?.trim()
    if (!raw) return fallback
    try {
      const parsed = JSON.parse(raw) as {
        methods?: Record<string, unknown>
        accountPolicy?: CustomerBuyerAccountPolicy
      }
      const methods = parsed.methods ?? {}
      const social = (value: unknown): CustomerAuthSocialPolicy => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return { enabled: false, credentialRef: null }
        }
        const record = value as Record<string, unknown>
        return {
          enabled: record.enabled === true,
          credentialRef:
            typeof record.credentialRef === "string" && record.credentialRef.trim()
              ? record.credentialRef.trim()
              : null,
        }
      }
      return {
        methods: {
          emailCode:
            typeof methods.emailCode === "boolean" ? methods.emailCode : fallback.methods.emailCode,
          emailPassword:
            typeof methods.emailPassword === "boolean"
              ? methods.emailPassword
              : fallback.methods.emailPassword,
          google: social(methods.google),
          facebook: social(methods.facebook),
          apple: social(methods.apple),
        },
        accountPolicy: normalizeCustomerBuyerAccountPolicy(parsed.accountPolicy),
      }
    } catch (error) {
      throw new Error("Invalid VOYANT_CUSTOMER_AUTH_CONFIG_JSON", { cause: error })
    }
  }

  function defaultCustomerAuthContext(
    env: Env,
    policy: CustomerAuthPolicy,
  ): CustomerAuthRuntimeContext {
    const hasCanonicalPolicy = Boolean(env.VOYANT_CUSTOMER_AUTH_CONFIG_JSON?.trim())
    const google = Boolean(
      env.CUSTOMER_AUTH_GOOGLE_CLIENT_ID?.trim() &&
        env.CUSTOMER_AUTH_GOOGLE_CLIENT_SECRET?.trim() &&
        (!hasCanonicalPolicy || policy.methods.google.enabled),
    )
    const facebook = Boolean(
      env.CUSTOMER_AUTH_FACEBOOK_CLIENT_ID?.trim() &&
        env.CUSTOMER_AUTH_FACEBOOK_CLIENT_SECRET?.trim() &&
        (!hasCanonicalPolicy || policy.methods.facebook.enabled),
    )
    const apple = Boolean(
      env.CUSTOMER_AUTH_APPLE_CLIENT_ID?.trim() &&
        env.CUSTOMER_AUTH_APPLE_CLIENT_SECRET?.trim() &&
        (!hasCanonicalPolicy || policy.methods.apple.enabled),
    )
    return {
      publicApiBaseURL: getPublicApiBaseUrl(env),
      baseURL: getAuthBaseUrl(env),
      ...(env.CUSTOMER_STOREFRONT_ORIGIN?.trim()
        ? { invitationAcceptBaseURL: env.CUSTOMER_STOREFRONT_ORIGIN.trim() }
        : {}),
      trustedOrigins: getTrustedOrigins(env),
      methods: {
        emailCode: policy.methods.emailCode,
        emailPassword: policy.methods.emailPassword,
        socialProviders: {
          ...(google
            ? {
                google: {
                  clientId: env.CUSTOMER_AUTH_GOOGLE_CLIENT_ID!.trim(),
                  clientSecret: env.CUSTOMER_AUTH_GOOGLE_CLIENT_SECRET!.trim(),
                },
              }
            : {}),
          ...(facebook
            ? {
                facebook: {
                  clientId: env.CUSTOMER_AUTH_FACEBOOK_CLIENT_ID!.trim(),
                  clientSecret: env.CUSTOMER_AUTH_FACEBOOK_CLIENT_SECRET!.trim(),
                },
              }
            : {}),
          ...(apple
            ? {
                apple: {
                  clientId: env.CUSTOMER_AUTH_APPLE_CLIENT_ID!.trim(),
                  clientSecret: env.CUSTOMER_AUTH_APPLE_CLIENT_SECRET!.trim(),
                },
              }
            : {}),
        },
      },
      accountPolicy: policy.accountPolicy,
    }
  }

  async function resolveCustomerAuthContext(
    env: Env,
    request: Request,
  ): Promise<CustomerAuthRuntimeContext> {
    const context = runtimeOptions.resolveCustomerAuthContext
      ? await runtimeOptions.resolveCustomerAuthContext(env, request)
      : defaultCustomerAuthContext(env, parseCustomerAuthPolicy(env))
    const baseURL = requireCanonicalOrigin(context.baseURL, "customer auth baseURL")
    const publicApiBaseURL = requirePublicApiBaseUrl(
      context.publicApiBaseURL ?? `${baseURL}/api`,
      baseURL,
    )
    // Fold the resolved storefront's trusted origins together with the static
    // env allowlist so a cross-origin customer-auth call from any allowed
    // storefront origin is trusted by Better Auth (WORK: direct-client support).
    // Wildcard (`https://*.host`) entries pass through untouched — Better Auth
    // matches them natively; every other entry must be a canonical origin.
    const trustedOrigins = [...new Set([...context.trustedOrigins, ...getTrustedOrigins(env)])].map(
      (origin) =>
        isCustomerWildcardOrigin(origin)
          ? origin
          : requireCanonicalOrigin(origin, "customer auth trusted origin"),
    )
    const invitationAcceptBaseURL = context.invitationAcceptBaseURL
      ? requireCanonicalOrigin(
          context.invitationAcceptBaseURL,
          "customer invitation accept baseURL",
        )
      : undefined
    return {
      ...context,
      baseURL,
      publicApiBaseURL,
      trustedOrigins,
      ...(invitationAcceptBaseURL ? { invitationAcceptBaseURL } : {}),
    }
  }

  /** A single-label `https://*.host` wildcard trusted-origin declaration. */
  function isCustomerWildcardOrigin(value: string): boolean {
    if (!value.startsWith("https://*.")) return false
    const host = value.slice("https://*.".length)
    return host.length > 0 && !host.includes("*") && !host.includes("/") && !host.includes(":")
  }

  function requireCanonicalOrigin(value: string, label: string): string {
    let parsed: URL
    try {
      parsed = new URL(value)
    } catch {
      throw new Error(`${label} must be an absolute HTTP(S) origin`)
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(`${label} must be an absolute HTTP(S) origin`)
    }
    return parsed.origin
  }

  function requirePublicApiBaseUrl(value: string, baseURL: string): string {
    let parsed: URL
    try {
      parsed = new URL(value)
    } catch {
      throw new Error("customer auth publicApiBaseURL must be an absolute HTTP(S) URL")
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.origin !== baseURL ||
      parsed.pathname === "/"
    ) {
      throw new Error("customer auth publicApiBaseURL must be an absolute HTTP(S) URL with a path")
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "")
    return parsed.toString().replace(/\/$/, "")
  }

  async function publicCustomerAuthConfiguration(env: Env, request: Request) {
    const context = await resolveCustomerAuthContext(env, request)
    const methods = context.methods
    const providers = methods.socialProviders ?? {}
    return {
      methods: {
        emailCode: methods.emailCode ?? true,
        emailPassword: methods.emailPassword ?? true,
        google: Boolean(providers.google),
        facebook: Boolean(providers.facebook),
        apple: Boolean(providers.apple),
      },
      accountPolicy: normalizeCustomerBuyerAccountPolicy(context.accountPolicy),
    }
  }

  function buildAdminBetterAuth(env: Env, db: VoyantDb) {
    const emailSender = runtimeOptions.resolveEmailSender?.(env)
    const cloudAuthExchange = isVoyantCloudAuthMode(env) ? getCloudAuthExchangeConfig(env) : null
    const authDb = db as NonNullable<Parameters<typeof createAdminBetterAuth>[0]>["db"]
    const cloudAuthDb = db as Parameters<typeof createVoyantCloudAdminAuthPlugin>[0]["db"]

    return createAdminBetterAuth({
      // `db` is a `NeonDatabase` (neon-serverless WebSocket); the
      // `CreateBetterAuthOptions.db` type still references the older
      // `getDb` return union (postgres-js + neon-http). Drizzle's
      // PgDatabase surface is identical across flavors at runtime, so
      // the cast is structurally safe — better-auth's drizzleAdapter
      // works on any PgDatabase. See #500 for context.
      db: authDb,
      secret: requireAdminAuthSecret(env),
      baseURL: getAuthBaseUrl(env),
      basePath: "/auth/admin",
      trustedOrigins: getTrustedOrigins(env),
      advanced: (runtimeOptions.cookieAdvanced ?? buildBetterAuthCookieAdvancedOptions)(env),
      // The OAuth 2.1 authorization server backing MCP connectors is always
      // mounted: chat assistants discover it from the MCP endpoint's
      // `WWW-Authenticate` challenge, and a deployment cannot know in advance
      // that nobody will connect one. Registration on its own grants nothing —
      // the consent screen is the trust boundary.
      plugins: [
        // Signs the JWT access tokens the OAuth provider issues. Must be
        // registered before `oauthProvider`, which looks the plugin up to
        // decide whether it can issue verifiable (non-opaque) tokens.
        jwt(),
        oauthProvider(
          mcpOAuthProviderConfig({ resource: `${getPublicApiBaseUrl(env)}/v1/admin/mcp` }),
        ),
        ...(cloudAuthExchange
          ? [
              createVoyantCloudAdminAuthPlugin({
                db: cloudAuthDb,
                cookieSecret: env.SESSION_CLAIMS_ADMIN_SECRET,
                secureStateCookie:
                  new URL(`${getPublicApiBaseUrl(env)}/auth/admin/cloud/callback`).protocol ===
                  "https:",
                exchange: cloudAuthExchange,
              }),
            ]
          : []),
      ],
      sendResetPassword: async ({ user, url }) => {
        if (!emailSender) {
          // No email provider (e.g. local dev without a sending domain): with the
          // debug flag on, log the link to the console instead of sending;
          // otherwise fail loudly. Never bypasses a configured cloud sender.
          if (allowAuthSecretLogging(env)) {
            console.info(`[auth] reset-password (debug fallback) -> ${user.email}: ${url}`)
            return
          }
          throw new Error("Password reset email provider is not configured")
        }
        await emailSender.sendResetPassword({ user, url })
      },
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (!emailSender) {
          // No email provider (e.g. local dev without a sending domain): with the
          // debug flag on, log the OTP to the console instead of sending;
          // otherwise fail loudly. Never bypasses a configured cloud sender.
          if (allowAuthSecretLogging(env)) {
            console.info(`[auth] verification-otp (debug fallback) [${type}] -> ${email}: ${otp}`)
            return
          }
          throw new Error("Verification OTP email provider is not configured")
        }
        await emailSender.sendVerificationOtp({ email, otp, type })
      },
    })
  }

  async function buildCustomerBetterAuth(
    env: Env,
    db: VoyantDb,
    request: Request,
    resolvedContext?: CustomerAuthRuntimeContext,
  ) {
    const emailSender = runtimeOptions.resolveEmailSender?.(env)
    const context = resolvedContext ?? (await resolveCustomerAuthContext(env, request))
    const publicApiBaseURL = context.publicApiBaseURL ?? getPublicApiBaseUrl(env)
    const authDb = db as NonNullable<Parameters<typeof createCustomerBetterAuth>[0]>["db"]
    const invitationAcceptBaseURL = context.invitationAcceptBaseURL
    const invitationEmailSender = invitationAcceptBaseURL ? emailSender : null
    return createCustomerBetterAuth({
      db: authDb,
      secret: requireCustomerAuthSecret(env),
      baseURL: context.baseURL,
      basePath: "/auth/customer",
      trustedOrigins: context.trustedOrigins,
      methods: withCustomerSocialRedirectUris(context.methods, publicApiBaseURL),
      accountPolicy: context.accountPolicy,
      ...(invitationAcceptBaseURL && invitationEmailSender
        ? {
            sendOrganizationInvitation: async ({ id, email, organization, inviter, role }) => {
              const url = customerOrganizationInvitationUrl(invitationAcceptBaseURL, id)
              await invitationEmailSender.sendCustomerOrganizationInvitation({
                email,
                organizationName: organization.name,
                inviterName: inviter.user.name,
                role,
                url,
              })
            },
          }
        : {}),
      sendResetPassword: async ({ user, url }) => {
        const publicUrl = withCustomerPublicResetPasswordUrl(url, publicApiBaseURL)
        if (!emailSender) {
          if (allowAuthSecretLogging(env)) {
            console.info(
              `[auth/customer] reset-password (debug fallback) -> ${user.email}: ${publicUrl}`,
            )
            return
          }
          throw new Error("Password reset email provider is not configured")
        }
        await emailSender.sendResetPassword({ user, url: publicUrl })
      },
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (!emailSender) {
          if (allowAuthSecretLogging(env)) {
            console.info(
              `[auth/customer] verification-otp (debug fallback) [${type}] -> ${email}: ${otp}`,
            )
            return
          }
          throw new Error("Verification OTP email provider is not configured")
        }
        await emailSender.sendVerificationOtp({ email, otp, type })
      },
    })
  }

  /**
   * Serve the OAuth discovery documents an MCP client fetches before it can
   * connect, or `null` when the request is not a discovery request.
   *
   * These MUST live at the origin root rather than behind the API base path:
   * after reading the `WWW-Authenticate` challenge, clients derive the metadata
   * URL from the origin, per RFC 9728 and RFC 8414. Both specs also define a
   * path-suffixed form (`/.well-known/oauth-protected-resource/api/v1/admin/mcp`),
   * which clients use when the resource is not at the root — so both shapes are
   * answered.
   */
  async function resolveOAuthDiscoveryRequest(
    request: Request,
    env: Env,
  ): Promise<Response | null> {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "")
    const matches = (wellKnown: string) =>
      pathname === wellKnown || pathname.startsWith(`${wellKnown}/`)

    if (matches("/.well-known/oauth-protected-resource")) {
      const publicApiBaseUrl = getPublicApiBaseUrl(env)
      return Response.json(
        mcpProtectedResourceMetadata({
          resource: `${publicApiBaseUrl}/v1/admin/mcp`,
          // RFC 9728 wants issuer IDENTIFIERS here, and Better Auth's issuer is
          // its baseURL plus basePath. A client resolves this to
          // `/.well-known/oauth-authorization-server/auth/admin`, which the
          // path-suffixed branch below answers.
          authorizationServer: `${getAuthBaseUrl(env)}/auth/admin`,
          resourceName: "Voyant",
        }),
        { headers: OAUTH_DISCOVERY_HEADERS },
      )
    }

    if (!matches("/.well-known/oauth-authorization-server")) return null

    const { db, dispose } = openDatabase(env)
    try {
      const auth = buildAdminBetterAuth(env, db)
      // Go through the plugin's own route rather than a typed API call: the
      // provider is supplied as a generic plugin, so its endpoints are not on
      // the inferred `auth.api` surface, and this keeps the document exactly
      // what the authorization server itself would serve.
      const response = await auth.handler(
        new Request(`${getAuthBaseUrl(env)}/auth/admin/.well-known/oauth-authorization-server`, {
          headers: request.headers,
        }),
      )
      if (!response.ok) return null
      const metadata = (await response.json()) as Record<string, unknown>
      return Response.json(
        withPublicApiEndpoints(metadata, {
          authBaseUrl: getAuthBaseUrl(env),
          publicApiBaseUrl: getPublicApiBaseUrl(env),
        }),
        { headers: OAUTH_DISCOVERY_HEADERS },
      )
    } finally {
      await dispose()
    }
  }

  /**
   * Resolve an MCP connector's OAuth access token into a staff auth context.
   *
   * The token is a JWT signed by this deployment's own authorization server, so
   * it is verified against the published JWKS rather than a database lookup —
   * introspection would require the resource server to hold client credentials
   * for itself.
   *
   * Authorization is deliberately re-derived on every request instead of being
   * trusted from the token: the grant only says "this connector may act for
   * this staff member, read-only or read-write". The actual permissions come
   * from the staff member's current role, so narrowing someone's access
   * immediately narrows every connector they approved.
   */
  async function resolveMcpAccessToken(
    env: Env,
    db: VoyantDb,
    token: string,
  ): Promise<VoyantAuthContext | null> {
    const baseUrl = getPublicApiBaseUrl(env)
    let claims: Record<string, unknown>
    try {
      claims = (await verifyAccessToken(token, {
        jwksUrl: `${baseUrl}/auth/admin/jwks`,
        verifyOptions: {
          // The audience binds the token to the MCP resource specifically, so a
          // grant issued for another audience on this server cannot be replayed
          // here. The issuer is Better Auth's `baseURL` — the bare origin,
          // because `entry.ts` strips `/api` before the auth handler sees it.
          audience: `${baseUrl}/v1/admin/mcp`,
          // Better Auth's issuer is its `baseURL` PLUS its `basePath`, not the
          // bare origin — verified against the real published metadata in
          // `tests/integration/mcp-oauth-flow.test.ts`. Using the origin alone
          // rejects every token.
          issuer: `${getAuthBaseUrl(env)}/auth/admin`,
        },
      })) as Record<string, unknown>
    } catch {
      // Expired, wrong audience, bad signature: all indistinguishable to a
      // caller, and all mean "not authenticated".
      return null
    }

    const userId = typeof claims.sub === "string" ? claims.sub.trim() : ""
    if (!userId) return null
    const clientId = typeof claims.client_id === "string" ? claims.client_id.trim() : ""
    if (!clientId) return null

    // A signed JWT stays valid until it expires, so the signature alone cannot
    // honour "Disconnect". Re-check the consent row on every request: revoking a
    // connector deletes it, and access stops on the very next call instead of
    // whenever the token happens to lapse. This costs nothing extra in
    // practice — the staff-access lookup below already goes to the database.
    const [consent] = await db
      .select({ id: oauthConsentTable.id })
      .from(oauthConsentTable)
      .where(and(eq(oauthConsentTable.clientId, clientId), eq(oauthConsentTable.userId, userId)))
      .limit(1)
    if (!consent) return null

    const staffAccess = await resolveStaffAccess({
      accessCatalog: runtimeOptions.accessCatalog,
      authMode: resolveOperatorAuthMode(env),
      db,
      deploymentId: env.VOYANT_CLOUD_DEPLOYMENT_ID,
      userId,
    })
    if (!staffAccess) return null

    const scopes = resolveMcpGrantScopes({
      staffScopes: staffAccess.scopes,
      grantedOAuthScopes: parseOAuthScopeClaim(claims.scope),
      accessCatalog: runtimeOptions.accessCatalog,
    })
    if (scopes.length === 0) return null

    return {
      userId,
      organizationId: staffAccess.organizationId,
      // Modelled as an api_key caller, not a session: a connector is a scoped
      // machine credential, and every existing guard already treats api_key
      // callers correctly (including the MCP surface's coarse-guard exemption,
      // where per-tool scopes do the real gating).
      callerType: "api_key",
      actor: "staff",
      audience: "staff",
      realm: "admin",
      scopes,
    }
  }

  /** Resolve the authenticated session and its realm-specific access context. */
  async function resolveAuthRequest(
    request: Request,
    env: Env,
  ): Promise<VoyantResolvedSessionAuthContext | null> {
    const surface = classifyOperatorApiAuthSurface(request.url)
    if (!surface) return null
    const customerSurface = surface === "customer"
    if (customerSurface && env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return null
    }

    const { db, dispose } = openDatabase(env)
    try {
      // A storefront customer-auth resolution failure on `/v1/public/*` (missing/
      // unknown/revoked key or a disallowed origin) is a client-side auth failure,
      // not a server fault: resolve it to "unauthorized" (null) so the framework
      // returns 401 instead of letting it surface as a 500. Genuine faults still
      // throw. Mirrors the auth handler's onError mapping for `/auth/customer/*`.
      let customerContext: CustomerAuthRuntimeContext | null = null
      if (customerSurface) {
        try {
          customerContext = await resolveCustomerAuthContext(env, request)
        } catch (error) {
          if (error instanceof StorefrontCustomerAuthResolutionError) return null
          throw error
        }
      }
      const auth = customerSurface
        ? await buildCustomerBetterAuth(env, db, request, customerContext ?? undefined)
        : buildAdminBetterAuth(env, db)
      const session = await auth.api.getSession({ headers: request.headers })

      if (!session) {
        if (customerSurface && customerContext?.storefrontChannel) {
          return {
            isAnonymousRequest: true,
            userId: "anonymous-storefront",
            organizationId: null,
            callerType: "session",
            actor: "customer",
            audience: "customer",
            realm: "customer",
            scopes: [],
            storefrontChannel: customerContext.storefrontChannel,
          }
        }
        return null
      }

      if (!customerSurface && isVoyantCloudAuthMode(env)) {
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

      if (customerSurface) {
        await repairCustomerPersonalBuyerAccountEntitlement(db, session.user.id)
        const buyerStore = createDrizzleCustomerBuyerAccountStore(db)
        const relationshipPersonId = await buyerStore.getRelationshipPersonId(session.user.id)
        const activeAuthOrganizationId =
          (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null
        const buyer = await resolveActiveCustomerBuyerContext({
          identity: {
            userId: session.user.id,
            name: session.user.name ?? null,
            email: session.user.email ?? null,
          },
          activeAuthOrganizationId,
          policy: customerContext?.accountPolicy,
          store: buyerStore,
        })
        const customerIdentity = {
          userId: session.user.id,
          sessionId: session.session.id,
          // Existing organizationId is staff/workspace context. Customer buyer
          // scoping uses the explicit discriminated buyer fields below.
          organizationId: null,
          callerType: "session" as const,
          actor: "customer" as const,
          realm: "customer" as const,
          scopes: [],
          email: session.user.email ?? null,
          ...(customerContext?.storefrontChannel
            ? { storefrontChannel: customerContext.storefrontChannel }
            : {}),
        }
        if (!buyer) {
          return {
            ...customerIdentity,
            relationshipPersonId,
          }
        }

        return {
          ...customerIdentity,
          buyerAccountId: buyer.id,
          buyerAccountKind: buyer.kind,
          authOrganizationId: buyer.authOrganizationId,
          relationshipOrganizationId: buyer.relationshipOrganizationId,
          relationshipPersonId,
          buyerMembershipId: buyer.membershipId,
          buyerMembershipRole: buyer.membershipRole,
        }
      }

      const staffAccess = await resolveStaffAccess({
        accessCatalog: runtimeOptions.accessCatalog,
        authMode: resolveOperatorAuthMode(env),
        db,
        deploymentId: env.VOYANT_CLOUD_DEPLOYMENT_ID,
        userId: session.user.id,
      })
      if (!staffAccess) return null

      return {
        userId: session.user.id,
        sessionId: session.session.id,
        organizationId: staffAccess.organizationId,
        callerType: "session",
        actor: "staff",
        realm: "admin",
        // Member RBAC scope set (RFC voyant#2085). Defaults to full access until
        // an admin assigns permissions, so existing deployments are unchanged.
        // `actor: "staff"` is retained, so actor-gated paths (incl. the
        // bookings-pii reveal, which short-circuits on staff) are unaffected.
        scopes: staffAccess.scopes,
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
  async function hasAuthPermission(request: Request, env: Env): Promise<boolean> {
    const auth = await resolveAuthRequest(request, env)
    return auth !== null
  }

  /**
   * Authorize a customer-realm cross-origin request for dynamic CORS. Returns
   * the exact request origin to echo in `Access-Control-Allow-Origin`, or `null`
   * to omit CORS headers. Only the customer surface (`/v1/public/*` and
   * `/auth/customer/*`) is dynamically authorized; every other surface keeps the
   * static `CORS_ALLOWLIST` behavior. The customer realm being disabled, or no
   * authorizer being wired, yields `null` (static behavior).
   */
  async function resolveCustomerCorsOrigin(request: Request, env: Env): Promise<string | null> {
    if (!runtimeOptions.resolveCustomerCorsOrigin) return null
    if (env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") return null
    if (!isCustomerCorsSurface(request.url)) return null
    return runtimeOptions.resolveCustomerCorsOrigin(env, request)
  }

  class CurrentUserNotFoundError extends Error {
    constructor() {
      super("User not found")
      this.name = "CurrentUserNotFoundError"
    }
  }

  async function getCurrentUserForRequest(
    request: Request,
    env: Env,
  ): Promise<OperatorCurrentUser | null> {
    if (shouldUseBrowserEvidenceAuthFallback(env, request)) {
      return null
    }

    const { db, dispose } = openDatabase(env)
    try {
      const betterAuth = buildAdminBetterAuth(env, db)
      const session = await betterAuth.api.getSession({ headers: request.headers })
      if (!session) {
        return null
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
        throw new CurrentUserNotFoundError()
      }

      return {
        id: row.id,
        email: row.email ?? session.user.email ?? "",
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        locale: row.locale ?? "en",
        timezone: row.timezone ?? null,
        uiPrefs: row.uiPrefs ?? null,
        isSuperAdmin: row.isSuperAdmin ?? false,
        isSupportUser: row.isSupportUser ?? false,
        createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
        profilePictureUrl: row.avatarUrl ?? null,
      }
    } finally {
      await dispose()
    }
  }

  async function getBootstrapStatusForRequest(
    request: Request,
    env: Env,
  ): Promise<OperatorAuthBootstrapStatus> {
    const modules = runtimeOptions.activeModules
      ? { modules: [...runtimeOptions.activeModules] }
      : {}
    if (shouldUseBrowserEvidenceAuthFallback(env, request)) {
      return { hasUsers: true, ...modules }
    }

    if (isVoyantCloudAuthMode(env)) {
      return { hasUsers: true, authMode: "voyant-cloud", ...modules }
    }

    const { db, dispose } = openDatabase(env)
    try {
      const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(authUser)
      return { hasUsers: (row?.count ?? 0) > 0, authMode: "local", ...modules }
    } finally {
      await dispose()
    }
  }

  async function validateApiTokenAccess(
    env: Env,
    db: VoyantDb,
    apiKey: SelectApikey,
  ): Promise<boolean> {
    if (!isVoyantCloudAuthMode(env)) return true

    const revalidateConfig = getCloudAuthRevalidateConfig(env)
    if (!revalidateConfig) return false

    try {
      const revalidation = await revalidateVoyantCloudAdminAuthUser({
        db: db as Parameters<typeof revalidateVoyantCloudAdminAuthUser>[0]["db"],
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
    try {
      const currentUser = await getCurrentUserForRequest(c.req.raw, c.env)
      if (!currentUser) {
        return c.json({ error: "Unauthorized" }, 401)
      }
      return c.json(currentUser)
    } catch (error) {
      if (error instanceof CurrentUserNotFoundError) {
        return c.json({ error: "User not found" }, 404)
      }
      throw error
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
    const { db, dispose } = openDatabase(c.env)
    try {
      const betterAuth = buildAdminBetterAuth(c.env, db)
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
    return c.json(await getBootstrapStatusForRequest(c.req.raw, c.env))
  })

  async function handleApiTokensFacade(c: Context<AuthHonoEnv>) {
    const { db, dispose } = openDatabase(c.env)
    try {
      const betterAuth = buildAdminBetterAuth(c.env, db)
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
          accessCatalog: runtimeOptions.accessCatalog,
        })) ?? c.json({ error: "Not found" }, 404)
      )
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  }

  async function handleOrganizationMembersFacade(c: Context<AuthHonoEnv>) {
    const { db, dispose } = openDatabase(c.env)
    try {
      const betterAuth = buildAdminBetterAuth(c.env, db)
      const cloudAuthDb = db as Parameters<typeof revalidateVoyantCloudAdminAuthSession>[0]["db"]

      if (isVoyantCloudAuthMode(c.env)) {
        const revalidateConfig = getCloudAuthRevalidateConfig(c.env)
        if (!revalidateConfig) {
          return c.json(
            { error: "Cloud-mode organization member lookup requires membership revalidation" },
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
          console.error("[auth/organization-members] Cloud revalidation failed:", error)
          return c.json({ error: "Voyant Cloud access could not be revalidated" }, 503)
        }
      }

      const organizationMembersDb = db as Parameters<
        typeof handleOrganizationMembersRequest
      >[2]["db"]
      return (
        (await handleOrganizationMembersRequest(c.req.raw, betterAuth, {
          db: organizationMembersDb,
        })) ?? c.json({ error: "Not found" }, 404)
      )
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  }

  async function handleCloudAuthStart(c: Context<AuthHonoEnv>) {
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
  }

  async function handleCloudAuthCallback(c: Context<AuthHonoEnv>) {
    if (!isVoyantCloudAuthMode(c.env)) {
      return c.json({ error: "Not found" }, 404)
    }

    const exchangeConfig = getCloudAuthExchangeConfig(c.env)
    if (!exchangeConfig) {
      const url = new URL(c.req.url)
      const callbackUrl = getCloudAuthStartConfig(c.env)?.adminCallbackUrl
      return c.json({ error: "Voyant Cloud auth exchange is not configured yet" }, 501, {
        "Set-Cookie": buildClearCloudAdminAuthStateCookie(
          callbackUrl ? new URL(callbackUrl).protocol === "https:" : url.protocol === "https:",
          url.pathname.replace(/\/callback$/, "") || "/auth/admin/cloud",
        ),
      })
    }

    const { db, dispose } = openDatabase(c.env)
    try {
      const betterAuth = buildAdminBetterAuth(c.env, db)
      return await betterAuth.handler(c.req.raw)
    } catch (error) {
      console.error("[auth/cloud/callback] Error:", error)
      return c.json({ error: "Voyant Cloud auth callback failed" }, 500)
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  }

  auth.get("/auth/admin/cloud/start", handleCloudAuthStart)
  auth.get("/auth/admin/cloud/callback", handleCloudAuthCallback)

  auth.all("/auth/api-tokens", handleApiTokensFacade)
  auth.all("/auth/api-tokens/:keyId", handleApiTokensFacade)
  auth.all("/auth/api-tokens/:keyId/rotate", handleApiTokensFacade)
  auth.get("/auth/organization/list-members", handleOrganizationMembersFacade)

  auth.get("/auth/customer/status", async (c) => {
    if (c.env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return c.json({ authenticated: false, disabled: true })
    }

    const { db, dispose } = openDatabase(c.env)
    try {
      const betterAuth = await buildCustomerBetterAuth(c.env, db, c.req.raw)
      const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
      return c.json({ authenticated: Boolean(session) })
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  })

  auth.get("/auth/customer/config", async (c) => {
    c.header("Cache-Control", "no-store")
    if (c.env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return c.json({
        disabled: true,
        methods: {
          emailCode: false,
          emailPassword: false,
          google: false,
          facebook: false,
          apple: false,
        },
      })
    }
    return c.json(await publicCustomerAuthConfiguration(c.env, c.req.raw))
  })

  const selectBuyerAccountSchema = z.object({ accountId: z.string().min(1) })

  const onboardingRuntime = runtimeOptions.customerBusinessAccountOnboarding
  const onboardingErrorResponse = (c: Context<AuthHonoEnv>, error: unknown): Response => {
    if (error instanceof CustomerBusinessOnboardingNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    if (error instanceof CustomerBusinessOnboardingConflictError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }

  const requireBusinessOnboarding = (
    c: Context<AuthHonoEnv>,
    context: CustomerAuthRuntimeContext,
    expected: "open" | "request" | "invitation",
  ): Response | null => {
    const policy = normalizeCustomerBuyerAccountPolicy(context.accountPolicy)
    if (!policy.allowedKinds.includes("business")) {
      return c.json({ error: "Customer business accounts are disabled" }, 404)
    }
    if (expected === "invitation") {
      return policy.businessOnboarding === "disabled"
        ? c.json({ error: "Customer business accounts are disabled" }, 403)
        : null
    }
    if (policy.businessOnboarding !== expected) {
      return c.json({ error: `Customer business onboarding is not ${expected}` }, 403)
    }
    if (!onboardingRuntime) {
      return c.json({ error: "Customer business onboarding provider is unavailable" }, 501)
    }
    return null
  }

  auth.get("/auth/customer/buyer-accounts", async (c) => {
    c.header("Cache-Control", "no-store")
    if (c.env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return c.json({ error: "Customer auth is disabled" }, 404)
    }

    const { db, dispose } = openDatabase(c.env)
    try {
      const context = await resolveCustomerAuthContext(c.env, c.req.raw)
      const betterAuth = await buildCustomerBetterAuth(c.env, db, c.req.raw, context)
      const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
      if (!session) return c.json({ error: "Unauthorized" }, 401)

      await repairCustomerPersonalBuyerAccountEntitlement(db, session.user.id)
      return c.json(
        await listCustomerBuyerAccounts({
          identity: {
            userId: session.user.id,
            name: session.user.name ?? null,
            email: session.user.email ?? null,
          },
          activeAuthOrganizationId:
            (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ??
            null,
          policy: context.accountPolicy,
          store: createDrizzleCustomerBuyerAccountStore(db),
        }),
      )
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  })

  auth.post("/auth/customer/buyer-accounts/active", async (c) => {
    c.header("Cache-Control", "no-store")
    if (c.env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return c.json({ error: "Customer auth is disabled" }, 404)
    }

    const body = await parseJsonBody(c, selectBuyerAccountSchema)
    const { db, dispose } = openDatabase(c.env)
    try {
      const context = await resolveCustomerAuthContext(c.env, c.req.raw)
      const betterAuth = await buildCustomerBetterAuth(c.env, db, c.req.raw, context)
      const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
      if (!session) return c.json({ error: "Unauthorized" }, 401)

      await repairCustomerPersonalBuyerAccountEntitlement(db, session.user.id)
      const selected = await selectCustomerBuyerAccount({
        accountId: body.accountId,
        identity: {
          userId: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email ?? null,
        },
        activeAuthOrganizationId:
          (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ??
          null,
        policy: context.accountPolicy,
        store: createDrizzleCustomerBuyerAccountStore(db),
      })
      if (!selected) {
        return c.json({ error: "Buyer account is unavailable" }, 403)
      }

      const activationUrl = new URL(c.req.url)
      activationUrl.pathname = "/auth/customer/organization/set-active"
      activationUrl.search = ""
      const activationHeaders = new Headers(c.req.raw.headers)
      activationHeaders.delete("content-length")
      activationHeaders.set("content-type", "application/json")
      const activationResponse = await betterAuth.handler(
        new Request(activationUrl, {
          method: "POST",
          headers: activationHeaders,
          body: JSON.stringify({ organizationId: selected.authOrganizationId }),
        }),
      )
      if (!activationResponse.ok) return activationResponse

      const headers = new Headers(activationResponse.headers)
      headers.delete("content-length")
      headers.set("cache-control", "no-store")
      headers.set("content-type", "application/json; charset=UTF-8")
      return new Response(JSON.stringify({ activeAccount: selected }), { status: 200, headers })
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  })

  auth.post("/auth/customer/business-accounts", async (c) => {
    c.header("Cache-Control", "no-store")
    if (c.env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return c.json({ error: "Customer auth is disabled" }, 404)
    }
    const input = await parseJsonBody(c, customerBusinessAccountCreateInputSchema)
    const { db, dispose } = openDatabase(c.env)
    try {
      const context = await resolveCustomerAuthContext(c.env, c.req.raw)
      const policyError = requireBusinessOnboarding(c, context, "open")
      if (policyError) return policyError
      if (!context.invitationAcceptBaseURL) {
        return c.json({ error: "Trusted storefront origin is not configured" }, 503)
      }
      const betterAuth = await buildCustomerBetterAuth(c.env, db, c.req.raw, context)
      const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
      if (!session) return c.json({ error: "Unauthorized" }, 401)

      let account: CustomerBusinessAccountDto
      try {
        account = await onboardingRuntime!.createBusinessAccount(
          { bindings: c.env, db },
          {
            requesterUserId: session.user.id,
            storefrontOrigin: new URL(context.invitationAcceptBaseURL).origin,
            idempotencyKey: input.idempotencyKey,
            profile: input.profile,
          },
        )
      } catch (error) {
        return onboardingErrorResponse(c, error)
      }

      const activationUrl = new URL(c.req.url)
      activationUrl.pathname = "/auth/customer/organization/set-active"
      activationUrl.search = ""
      const activationHeaders = new Headers(c.req.raw.headers)
      activationHeaders.delete("content-length")
      activationHeaders.set("content-type", "application/json")
      const activationResponse = await betterAuth.handler(
        new Request(activationUrl, {
          method: "POST",
          headers: activationHeaders,
          body: JSON.stringify({ organizationId: account.authOrganizationId }),
        }),
      )
      if (!activationResponse.ok) return activationResponse
      const headers = new Headers(activationResponse.headers)
      headers.delete("content-length")
      headers.set("cache-control", "no-store")
      headers.set("content-type", "application/json; charset=UTF-8")
      return new Response(JSON.stringify(account), { status: 201, headers })
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  })

  auth.get("/auth/customer/business-account-requests", async (c) => {
    c.header("Cache-Control", "no-store")
    if (c.env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return c.json({ error: "Customer auth is disabled" }, 404)
    }
    const query = customerBusinessAccountRequestListQuerySchema.parse(c.req.query())
    const { db, dispose } = openDatabase(c.env)
    try {
      const context = await resolveCustomerAuthContext(c.env, c.req.raw)
      const policyError = requireBusinessOnboarding(c, context, "request")
      if (policyError) return policyError
      const betterAuth = await buildCustomerBetterAuth(c.env, db, c.req.raw, context)
      const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
      if (!session) return c.json({ error: "Unauthorized" }, 401)
      try {
        return c.json(
          await onboardingRuntime!.listRequests(
            { bindings: c.env, db },
            { requesterUserId: session.user.id, status: query.status },
          ),
        )
      } catch (error) {
        return onboardingErrorResponse(c, error)
      }
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  })

  auth.post("/auth/customer/business-account-requests", async (c) => {
    c.header("Cache-Control", "no-store")
    if (c.env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return c.json({ error: "Customer auth is disabled" }, 404)
    }
    const input = await parseJsonBody(c, customerBusinessAccountRequestCreateInputSchema)
    const { db, dispose } = openDatabase(c.env)
    try {
      const context = await resolveCustomerAuthContext(c.env, c.req.raw)
      const policyError = requireBusinessOnboarding(c, context, "request")
      if (policyError) return policyError
      if (!context.invitationAcceptBaseURL) {
        return c.json({ error: "Trusted storefront origin is not configured" }, 503)
      }
      const betterAuth = await buildCustomerBetterAuth(c.env, db, c.req.raw, context)
      const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
      if (!session) return c.json({ error: "Unauthorized" }, 401)
      try {
        const request = await onboardingRuntime!.requestBusinessAccount(
          { bindings: c.env, db },
          {
            requesterUserId: session.user.id,
            storefrontOrigin: new URL(context.invitationAcceptBaseURL).origin,
            idempotencyKey: input.idempotencyKey,
            profile: input.profile,
          },
        )
        return c.json(request, 201)
      } catch (error) {
        return onboardingErrorResponse(c, error)
      }
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  })

  auth.delete("/auth/customer/business-account-requests/:requestId", async (c) => {
    c.header("Cache-Control", "no-store")
    if (c.env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return c.json({ error: "Customer auth is disabled" }, 404)
    }
    const { db, dispose } = openDatabase(c.env)
    try {
      const context = await resolveCustomerAuthContext(c.env, c.req.raw)
      const policyError = requireBusinessOnboarding(c, context, "request")
      if (policyError) return policyError
      const betterAuth = await buildCustomerBetterAuth(c.env, db, c.req.raw, context)
      const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
      if (!session) return c.json({ error: "Unauthorized" }, 401)
      try {
        return c.json(
          await onboardingRuntime!.cancelRequest(
            { bindings: c.env, db },
            { requestId: c.req.param("requestId"), requesterUserId: session.user.id },
          ),
        )
      } catch (error) {
        return onboardingErrorResponse(c, error)
      }
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  })

  auth.post("/auth/customer/business-account-invitations/accept", async (c) => {
    c.header("Cache-Control", "no-store")
    if (c.env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return c.json({ error: "Customer auth is disabled" }, 404)
    }
    const input = await parseJsonBody(c, customerBusinessInvitationAcceptInputSchema)
    const { db, dispose } = openDatabase(c.env)
    try {
      const context = await resolveCustomerAuthContext(c.env, c.req.raw)
      const policyError = requireBusinessOnboarding(c, context, "invitation")
      if (policyError) return policyError
      const betterAuth = await buildCustomerBetterAuth(c.env, db, c.req.raw, context)
      const session = await betterAuth.api.getSession({ headers: c.req.raw.headers })
      if (!session) return c.json({ error: "Unauthorized" }, 401)

      const acceptUrl = new URL(c.req.url)
      acceptUrl.pathname = "/auth/customer/organization/accept-invitation"
      acceptUrl.search = ""
      const betterAuthHeaders = new Headers(c.req.raw.headers)
      betterAuthHeaders.delete("content-length")
      betterAuthHeaders.set("content-type", "application/json")
      const accepted = await betterAuth.handler(
        new Request(acceptUrl, {
          method: "POST",
          headers: betterAuthHeaders,
          body: JSON.stringify({ invitationId: input.invitationId }),
        }),
      )
      if (!accepted.ok) return accepted
      const acceptedPayload = (await accepted.clone().json()) as {
        invitation?: { organizationId?: string }
        member?: { organizationId?: string }
      }
      const organizationId =
        acceptedPayload.member?.organizationId ?? acceptedPayload.invitation?.organizationId
      if (!organizationId) {
        return c.json({ error: "Accepted invitation did not identify an organization" }, 502)
      }

      const activationUrl = new URL(c.req.url)
      activationUrl.pathname = "/auth/customer/organization/set-active"
      activationUrl.search = ""
      const activated = await betterAuth.handler(
        new Request(activationUrl, {
          method: "POST",
          headers: betterAuthHeaders,
          body: JSON.stringify({ organizationId }),
        }),
      )
      if (!activated.ok) return activated

      const listed = await listCustomerBuyerAccounts({
        identity: {
          userId: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email ?? null,
        },
        activeAuthOrganizationId: organizationId,
        policy: context.accountPolicy,
        store: createDrizzleCustomerBuyerAccountStore(db),
      })
      const account = listed.accounts.find(
        (candidate) =>
          candidate.kind === "business" && candidate.authOrganizationId === organizationId,
      )
      if (!account) {
        return c.json({ error: "Accepted business account is unavailable" }, 409)
      }

      const headers = new Headers(accepted.headers)
      headers.delete("content-length")
      for (const cookie of activated.headers.getSetCookie()) headers.append("set-cookie", cookie)
      headers.set("cache-control", "no-store")
      headers.set("content-type", "application/json; charset=UTF-8")
      return new Response(JSON.stringify({ account }), { status: 200, headers })
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  })

  auth.all("/auth/customer/*", async (c) => {
    if (c.env.VOYANT_CUSTOMER_AUTH_MODE?.trim() === "disabled") {
      return c.json({ error: "Customer auth is disabled" }, 404)
    }

    const { db, dispose } = openDatabase(c.env)
    try {
      const betterAuth = await buildCustomerBetterAuth(c.env, db, c.req.raw)
      return await betterAuth.handler(c.req.raw)
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  })

  /**
   * Catch-all: delegate to Better Auth handler.
   * Handles sign-in, sign-up, sign-out, password reset, OAuth callbacks, etc.
   *
   * Sign-up is gated by a `user.create.before` hook in @voyant-travel/auth — once a
   * user exists, the hook throws and BA returns an error to the client.
   */
  auth.all("/auth/admin/*", async (c) => {
    if (isVoyantCloudAuthMode(c.env) && !isCloudAllowedBetterAuthRoute(c.req.raw)) {
      return localAuthDisabledResponse(c)
    }

    const { db, dispose } = openDatabase(c.env)
    try {
      const betterAuth = buildAdminBetterAuth(c.env, db)
      return await betterAuth.handler(c.req.raw)
    } finally {
      c.executionCtx.waitUntil(dispose())
    }
  })

  return {
    handler: auth,
    getBootstrapStatusForRequest,
    getCurrentUserForRequest,
    hasAuthPermission,
    resolveAuthRequest,
    resolveMcpAccessToken,
    resolveOAuthDiscoveryRequest,
    resolveCustomerCorsOrigin,
    validateApiTokenAccess,
  }
}
