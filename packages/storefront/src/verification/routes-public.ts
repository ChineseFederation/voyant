import { createRoute, OpenAPIHono } from "@hono/zod-openapi"
import type { ModuleContainer } from "@voyant-travel/core"
import { clientIpKey, enforceRateLimit, openApiValidationHook } from "@voyant-travel/hono"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import {
  createStorefrontVerificationSendersFromProviders,
  createStorefrontVerificationService,
  StorefrontVerificationError,
  type StorefrontVerificationNotificationProvider,
  type StorefrontVerificationProviderOptions,
  type StorefrontVerificationSenders,
  type StorefrontVerificationServiceOptions,
} from "./service.js"
import {
  confirmEmailVerificationChallengeSchema,
  confirmSmsVerificationChallengeSchema,
  startEmailVerificationChallengeSchema,
  startSmsVerificationChallengeSchema,
  storefrontVerificationConfirmResponseSchema,
  storefrontVerificationErrorResponseSchema,
  storefrontVerificationStartResponseSchema,
} from "./validation.js"

/**
 * Shared non-2xx response declarations for the verification routes
 * (voyant#2114, Batch C). `errorResponse(...)` maps the service's typed errors
 * onto a fixed set of statuses — `sender_not_configured` → 501,
 * `challenge_not_found` → 404, `challenge_expired` → 410, and
 * `challenge_invalid`/`challenge_failed` → 409, with a 400 fallback — so each
 * route documents exactly the statuses its handler can emit.
 */
const verificationErrorContent = {
  content: { "application/json": { schema: storefrontVerificationErrorResponseSchema } },
} as const

/**
 * Every verification handler funnels its failures through `errorResponse(...)`,
 * which yields one of a fixed status union (400/404/409/410/501). Each route
 * declares those statuses inline (a spread of a shared `as const` map loses the
 * literal numeric keys `@hono/zod-openapi` needs, collapsing the handler's
 * allowed return union); the start routes additionally surface 429 from the
 * rate limiter.
 */
const badRequestResponse = {
  description: "Malformed verification request",
  ...verificationErrorContent,
}
const notFoundResponse = {
  description: "Verification challenge not found",
  ...verificationErrorContent,
}
const conflictResponse = {
  description: "Verification code is invalid or the attempt failed",
  ...verificationErrorContent,
}
const goneResponse = {
  description: "Verification challenge has expired",
  ...verificationErrorContent,
}
const notConfiguredResponse = {
  description: "Verification sender is not configured",
  ...verificationErrorContent,
}
const rateLimitedResponse = {
  description: "Too many verification attempts",
  ...verificationErrorContent,
}

const startEmailChallengeRoute = createRoute({
  method: "post",
  path: "/email/start",
  request: {
    // `required: true` keeps the JSON validator running even when the caller
    // omits `Content-Type: application/json` (§16).
    body: {
      required: true,
      content: { "application/json": { schema: startEmailVerificationChallengeSchema } },
    },
  },
  responses: {
    201: {
      description: "An email verification challenge was started",
      content: { "application/json": { schema: storefrontVerificationStartResponseSchema } },
    },
    400: badRequestResponse,
    429: rateLimitedResponse,
    501: notConfiguredResponse,
  },
})

const startSmsChallengeRoute = createRoute({
  method: "post",
  path: "/sms/start",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: startSmsVerificationChallengeSchema } },
    },
  },
  responses: {
    201: {
      description: "An SMS verification challenge was started",
      content: { "application/json": { schema: storefrontVerificationStartResponseSchema } },
    },
    400: badRequestResponse,
    429: rateLimitedResponse,
    501: notConfiguredResponse,
  },
})

const confirmEmailChallengeRoute = createRoute({
  method: "post",
  path: "/email/confirm",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: confirmEmailVerificationChallengeSchema } },
    },
  },
  responses: {
    200: {
      description: "The email verification challenge was confirmed",
      content: { "application/json": { schema: storefrontVerificationConfirmResponseSchema } },
    },
    400: badRequestResponse,
    404: notFoundResponse,
    409: conflictResponse,
    410: goneResponse,
  },
})

const confirmSmsChallengeRoute = createRoute({
  method: "post",
  path: "/sms/confirm",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: confirmSmsVerificationChallengeSchema } },
    },
  },
  responses: {
    200: {
      description: "The SMS verification challenge was confirmed",
      content: { "application/json": { schema: storefrontVerificationConfirmResponseSchema } },
    },
    400: badRequestResponse,
    404: notFoundResponse,
    409: conflictResponse,
    410: goneResponse,
  },
})

type Env = {
  Bindings: Record<string, unknown>
  Variables: {
    container: ModuleContainer
    db: PostgresJsDatabase
    userId?: string
  }
}

export interface StorefrontVerificationRoutesOptions
  extends StorefrontVerificationServiceOptions,
    StorefrontVerificationProviderOptions {
  sendEmailChallenge?: StorefrontVerificationSenders["sendEmailChallenge"]
  sendSmsChallenge?: StorefrontVerificationSenders["sendSmsChallenge"]
  providers?: ReadonlyArray<StorefrontVerificationNotificationProvider>
  resolveProviders?: (
    bindings: Record<string, unknown>,
  ) => ReadonlyArray<StorefrontVerificationNotificationProvider>
}

export const STOREFRONT_VERIFICATION_SENDERS_CONTAINER_KEY =
  "providers.storefrontVerification.senders"

export interface StorefrontVerificationChannelCoverage {
  /** Channels this deployment can deliver a challenge on. */
  supported: ReadonlyArray<"email" | "sms">
  /** Channels a shopper can reach but that no provider can deliver. */
  unsupported: ReadonlyArray<"email" | "sms">
}

export interface StorefrontVerificationSenderBundle {
  senders: StorefrontVerificationSenders
  coverage: StorefrontVerificationChannelCoverage
}

/**
 * The app's provider resolver runs at most once per call, and only when
 * something actually needs the provider set — an explicitly injected sender for
 * every channel answers both questions without resolving anything.
 */
function providerResolver(
  bindings: Record<string, unknown>,
  options?: StorefrontVerificationRoutesOptions,
) {
  let cached: ReadonlyArray<StorefrontVerificationNotificationProvider> | undefined
  return () => (cached ??= options?.resolveProviders?.(bindings) ?? options?.providers ?? [])
}

function channelCoverage(
  resolveProviders: () => ReadonlyArray<StorefrontVerificationNotificationProvider>,
  options?: StorefrontVerificationRoutesOptions,
): StorefrontVerificationChannelCoverage {
  const supported: Array<"email" | "sms"> = []
  const unsupported: Array<"email" | "sms"> = []
  let providerChannels: Set<string> | undefined

  for (const channel of ["email", "sms"] as const) {
    const explicitSender =
      channel === "email" ? options?.sendEmailChallenge : options?.sendSmsChallenge
    if (explicitSender) {
      supported.push(channel)
      continue
    }
    providerChannels ??= new Set(resolveProviders().flatMap((provider) => [...provider.channels]))
    if (providerChannels.has(channel)) supported.push(channel)
    else unsupported.push(channel)
  }

  return { supported, unsupported }
}

/**
 * Build the senders and report which channels they can actually reach, off one
 * resolution of the provider set.
 *
 * Both start routes mount unconditionally, so a channel with no provider behind
 * it is otherwise only discovered when a shopper asks for a code and gets a 501
 * (voyant#3948). The provider set comes from configuration, so the gap is
 * knowable at bootstrap — but the resolver must still run exactly once, which
 * is why coverage is returned alongside the senders rather than resolved again.
 */
export function buildStorefrontVerificationSenderBundle(
  bindings: Record<string, unknown>,
  options?: StorefrontVerificationRoutesOptions,
): StorefrontVerificationSenderBundle {
  const resolveProviders = providerResolver(bindings, options)
  const senders: StorefrontVerificationSenders = {
    sendEmailChallenge: options?.sendEmailChallenge,
    sendSmsChallenge: options?.sendSmsChallenge,
  }

  if (!senders.sendEmailChallenge || !senders.sendSmsChallenge) {
    const providers = resolveProviders()
    if (providers.length) {
      const providerSenders = createStorefrontVerificationSendersFromProviders(providers, options)
      senders.sendEmailChallenge ??= providerSenders.sendEmailChallenge
      senders.sendSmsChallenge ??= providerSenders.sendSmsChallenge
    }
  }

  return { senders, coverage: channelCoverage(resolveProviders, options) }
}

export function buildStorefrontVerificationSenders(
  bindings: Record<string, unknown>,
  options?: StorefrontVerificationRoutesOptions,
): StorefrontVerificationSenders {
  return buildStorefrontVerificationSenderBundle(bindings, options).senders
}

/** Which channels this deployment can actually deliver a challenge on. */
export function resolveStorefrontVerificationChannelCoverage(
  bindings: Record<string, unknown>,
  options?: StorefrontVerificationRoutesOptions,
): StorefrontVerificationChannelCoverage {
  return channelCoverage(providerResolver(bindings, options), options)
}

function getSenders(
  bindings: Record<string, unknown>,
  options: StorefrontVerificationRoutesOptions | undefined,
  resolveFromContainer?: <T>(key: string) => T,
): StorefrontVerificationSenders {
  if (resolveFromContainer) {
    try {
      return resolveFromContainer<StorefrontVerificationSenders>(
        STOREFRONT_VERIFICATION_SENDERS_CONTAINER_KEY,
      )
    } catch {
      // Fall back to per-request sender construction when bootstrap has not run.
    }
  }

  return buildStorefrontVerificationSenders(bindings, options)
}

type VerificationErrorStatus = 400 | 404 | 409 | 410 | 501

/**
 * Map a service error onto an HTTP status + body. The status is one of the
 * fixed 400/404/409/410/501 set; the caller passes it to a literal
 * `c.json(body, status)` so each handler's return type unifies cleanly with the
 * route's declared response union — `.openapi()` resolves inline `c.json`
 * unions but not a `c.json` returned from a helper (voyant#2114, Batch C).
 */
function errorResponse(error: unknown): {
  status: VerificationErrorStatus
  body: { error: string; code?: string }
} {
  if (error instanceof StorefrontVerificationError) {
    if (error.code === "sender_not_configured") {
      return { status: 501, body: { error: error.message, code: error.code } }
    }

    if (error.code === "challenge_not_found") {
      return { status: 404, body: { error: error.message, code: error.code } }
    }

    if (error.code === "challenge_expired") {
      return { status: 410, body: { error: error.message, code: error.code } }
    }

    if (error.code === "challenge_invalid" || error.code === "challenge_failed") {
      return { status: 409, body: { error: error.message, code: error.code } }
    }
  }

  const message = error instanceof Error ? error.message : "Verification request failed"
  return { status: 400, body: { error: message } }
}

/**
 * Serialize a challenge record to its JSON wire shape (voyant#2114, Batch C):
 * the service returns raw `Date` instances, but the declared response schema is
 * the string-dated wire contract, so the dates are coerced to ISO strings here
 * — the same coercion `c.json(...)` performs at runtime, made explicit so the
 * handler's return type matches the contract.
 */
function toChallengeRecordWire<
  T extends {
    expiresAt: Date
    verifiedAt: Date | null
    createdAt: Date
    updatedAt: Date
  },
>(record: T) {
  return {
    ...record,
    expiresAt: record.expiresAt.toISOString(),
    verifiedAt: record.verifiedAt ? record.verifiedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

/**
 * Forward the `Retry-After`/`X-RateLimit-*` headers the limiter set onto the
 * outgoing context, so the handler can re-issue a typed 429 `c.json(...)` that
 * unifies with the route's declared 429 leg (voyant#2114, Batch C).
 */
function forwardRateLimitHeaders(c: Context<Env>, limited: Response) {
  for (const header of ["retry-after", "x-ratelimit-limit", "x-ratelimit-remaining"]) {
    const value = limited.headers.get(header)
    if (value !== null) c.header(header, value)
  }
}

function normalizeDestination(channel: "email" | "sms", destination: string): string {
  return channel === "email" ? destination.trim().toLowerCase() : destination.trim()
}

export async function enforceVerificationStartLimits(
  c: Context<Env>,
  channel: "email" | "sms",
  destination: string,
) {
  const normalized = normalizeDestination(channel, destination)
  return (
    (await enforceRateLimit(c, {
      bucket: `storefront-verification:${channel}:destination-cooldown`,
      max: 1,
      windowSeconds: 30,
      clientKey: () => normalized,
    })) ??
    (await enforceRateLimit(c, {
      bucket: `storefront-verification:${channel}:destination-hour`,
      max: channel === "sms" ? 5 : 10,
      windowSeconds: 60 * 60,
      clientKey: () => normalized,
    })) ??
    (await enforceRateLimit(c, {
      bucket: `storefront-verification:${channel}:ip-hour`,
      max: channel === "sms" ? 20 : 40,
      windowSeconds: 60 * 60,
      clientKey: clientIpKey,
    }))
  )
}

export function createStorefrontVerificationPublicRoutes(
  options?: StorefrontVerificationRoutesOptions,
) {
  const service = createStorefrontVerificationService(options)

  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(startEmailChallengeRoute, async (c) => {
      try {
        const body = c.req.valid("json")
        const limited = await enforceVerificationStartLimits(c, "email", body.email)
        if (limited) {
          forwardRateLimitHeaders(c, limited)
          return c.json({ error: "Too Many Requests", code: "rate_limited" }, 429)
        }
        const result = await service.startEmailChallenge(
          c.get("db"),
          body,
          getSenders(c.env, options, (key) => c.var.container.resolve(key)),
        )
        return c.json({ data: toChallengeRecordWire(result) }, 201)
      } catch (error) {
        // A start can only fail with `sender_not_configured` (501) or a generic
        // 400; the challenge-lifecycle statuses (404/410/409) only arise on
        // confirm.
        const { status, body } = errorResponse(error)
        return status === 501 ? c.json(body, 501) : c.json(body, 400)
      }
    })
    .openapi(startSmsChallengeRoute, async (c) => {
      try {
        const body = c.req.valid("json")
        const limited = await enforceVerificationStartLimits(c, "sms", body.phone)
        if (limited) {
          forwardRateLimitHeaders(c, limited)
          return c.json({ error: "Too Many Requests", code: "rate_limited" }, 429)
        }
        const result = await service.startSmsChallenge(
          c.get("db"),
          body,
          getSenders(c.env, options, (key) => c.var.container.resolve(key)),
        )
        return c.json({ data: toChallengeRecordWire(result) }, 201)
      } catch (error) {
        const { status, body } = errorResponse(error)
        return status === 501 ? c.json(body, 501) : c.json(body, 400)
      }
    })
    .openapi(confirmEmailChallengeRoute, async (c) => {
      try {
        const result = await service.confirmEmailChallenge(c.get("db"), c.req.valid("json"))
        // A successful confirm always lands the challenge in `verified`
        // (`confirmChallenge` throws otherwise); narrow the wire status to the
        // documented `"verified"` literal.
        return c.json(
          { data: { ...toChallengeRecordWire(result), status: "verified" as const } },
          200,
        )
      } catch (error) {
        // Confirm surfaces the challenge-lifecycle statuses; a misconfigured
        // sender (501) cannot arise here, so it is not a declared response.
        const { status, body } = errorResponse(error)
        switch (status) {
          case 404:
            return c.json(body, 404)
          case 409:
            return c.json(body, 409)
          case 410:
            return c.json(body, 410)
          default:
            return c.json(body, 400)
        }
      }
    })
    .openapi(confirmSmsChallengeRoute, async (c) => {
      try {
        const result = await service.confirmSmsChallenge(c.get("db"), c.req.valid("json"))
        return c.json(
          { data: { ...toChallengeRecordWire(result), status: "verified" as const } },
          200,
        )
      } catch (error) {
        // Confirm surfaces the challenge-lifecycle statuses; a misconfigured
        // sender (501) cannot arise here, so it is not a declared response.
        const { status, body } = errorResponse(error)
        switch (status) {
          case 404:
            return c.json(body, 404)
          case 409:
            return c.json(body, 409)
          case 410:
            return c.json(body, 410)
          default:
            return c.json(body, 400)
        }
      }
    })
}

export type StorefrontVerificationPublicRoutes = ReturnType<
  typeof createStorefrontVerificationPublicRoutes
>
