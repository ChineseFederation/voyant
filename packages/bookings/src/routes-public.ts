// agent-quality: file-size exception — intentional: this public route module
// predates the 600-line limit (686 lines on main before the overview
// enrichment change) and splitting the OpenAPI route group is out of scope for
// the additive #2969 wiring; tracked for a follow-up split.
import { OpenAPIHono, z } from "@hono/zod-openapi"
import { idempotencyKey, openApiValidationHook, UnauthorizedApiError } from "@voyant-travel/hono"
import type { Context, MiddlewareHandler } from "hono"

import {
  type CheckoutCapabilityAction,
  guestBookingAccessActions,
  guestBookingAccessCookie,
  issueGuestBookingAccess,
  requireCheckoutCapability,
  requireGuestBookingAccess,
} from "./checkout-capability.js"
import { enforceGuestBookingLookupRateLimit } from "./guest-booking-rate-limit.js"
import {
  BOOKING_ROUTE_RUNTIME_CONTAINER_KEY,
  type BookingRouteRuntime,
  buildBookingRouteRuntime,
} from "./route-runtime.js"
import { createBookingsPublicRoute as createRoute } from "./routes-openapi.js"
import { type Env, getRuntimeEnv, notFound } from "./routes-shared.js"
import { type PublicBookingsServiceResolvers, publicBookingsService } from "./service-public.js"
import {
  publicBookingOverviewAccessQuerySchema,
  publicBookingOverviewSchema,
  publicBookingSessionMutationSchema,
  publicBookingSessionRepriceResultSchema,
  publicBookingSessionSchema,
  publicBookingSessionStateSchema,
  publicGuestBookingLookupResponseSchema,
  publicGuestBookingLookupSchema,
  publicRepriceBookingSessionSchema,
  publicUpdateBookingSessionSchema,
  publicUpsertBookingSessionStateSchema,
} from "./validation-public.js"

const errorResponseSchema = z.object({ error: z.string() })

/**
 * Narrows a session-mutation result union to the success variants that carry a
 * `session` while preserving the snapshot's inferred type — the service unions
 * widen `status` to `string` on some conflict branches, so a plain
 * `status === "ok"` check cannot discriminate.
 */
function hasSession<T extends { status: string }>(
  result: T,
): result is Extract<T, { session: unknown }> {
  return "session" in result
}

function sessionConflictError(status: string) {
  switch (status) {
    case "insufficient_capacity":
      return "Insufficient slot capacity"
    case "slot_unavailable":
      return "Availability slot is not bookable"
    case "invalid_transition":
      return "Booking session cannot move to the requested state"
    case "hold_expired":
      return "Booking session hold has expired"
    case "participant_not_found":
      return "Booking session traveler not found"
    case "pricing_unavailable":
      return "Pricing is not available for the selected booking session items"
    case "quantity_change_requires_reallocation":
      return "Changing quantity for held items requires a fresh reservation"
    default:
      return "Unable to process booking session"
  }
}

function attachGuestBookingAccess<T extends { bookingId: string }>(
  overview: T,
  issued: Awaited<ReturnType<typeof issueGuestBookingAccess>>,
) {
  return {
    overview,
    guestBookingAccess: {
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      actions: [...guestBookingAccessActions],
    },
  }
}

async function requireSessionCapability(c: Context, action: CheckoutCapabilityAction) {
  const sessionId = c.req.param("sessionId")
  if (!sessionId) {
    throw new UnauthorizedApiError("Missing checkout session id")
  }

  await requireCheckoutCapability(c, sessionId, action, getRuntimeEnv(c))
}

function sessionCapability(action: CheckoutCapabilityAction): MiddlewareHandler<Env> {
  return async (c, next) => {
    await requireSessionCapability(c, action)
    await next()
  }
}

/**
 * `/sessions/:sessionId` and `/sessions/:sessionId/state` are shared by a GET
 * (read capability) and a mutating PATCH/PUT (update capability + idempotency).
 * `createRoute` has no per-method middleware slot and `.use(path)` runs for all
 * methods on the path, so this single guard branches on the verb to preserve
 * the exact capability action and the mutating-only idempotency gate.
 */
function sessionResourceGuard(): MiddlewareHandler<Env> {
  const writeIdempotency = idempotencyKey<Env["Bindings"], Env["Variables"]>()
  return async (c, next) => {
    const isWrite = c.req.method !== "GET"
    await requireSessionCapability(c, isWrite ? "session:update" : "session:read")
    if (isWrite) {
      return writeIdempotency(c, next)
    }
    return next()
  }
}

function bookingLookupRateLimitKey(input: {
  bookingId?: string
  bookingNumber?: string
  bookingCode?: string
}) {
  return input.bookingCode ?? input.bookingNumber ?? input.bookingId ?? "unknown"
}

function guestBookingRateLimitResponse(c: Context, response: Response) {
  const retryAfter = response.headers.get("retry-after")
  if (retryAfter) c.header("Retry-After", retryAfter)
  return c.json({ error: "Too Many Requests" }, 429)
}

function getRouteRuntime(c: Context): BookingRouteRuntime {
  const container = (c.var as { container?: { resolve: (key: string) => unknown } }).container
  try {
    return (
      (container?.resolve(BOOKING_ROUTE_RUNTIME_CONTAINER_KEY) as
        | BookingRouteRuntime
        | undefined) ?? buildBookingRouteRuntime(c.env as Record<string, string | undefined>)
    )
  } catch {
    return buildBookingRouteRuntime(c.env as Record<string, string | undefined>)
  }
}

function publicResolvers(c: Context): PublicBookingsServiceResolvers {
  const runtime = getRouteRuntime(c)
  return {
    resolveBillingPerson: runtime.resolveBillingPerson,
    resolveTravelerPerson: runtime.resolveTravelerPerson,
  }
}

const sessionParamsSchema = z.object({ sessionId: z.string() })

const getSessionRoute = createRoute({
  method: "get",
  path: "/sessions/{sessionId}",
  request: { params: sessionParamsSchema },
  responses: {
    200: {
      description: "Booking session snapshot",
      content: { "application/json": { schema: z.object({ data: publicBookingSessionSchema }) } },
    },
    404: {
      description: "Booking session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateSessionRoute = createRoute({
  method: "patch",
  path: "/sessions/{sessionId}",
  request: {
    params: sessionParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: publicUpdateBookingSessionSchema } },
    },
  },
  responses: {
    200: {
      description: "Updated booking session snapshot",
      content: { "application/json": { schema: z.object({ data: publicBookingSessionSchema }) } },
    },
    404: {
      description: "Booking session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Booking session could not be updated",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getSessionStateRoute = createRoute({
  method: "get",
  path: "/sessions/{sessionId}/state",
  request: { params: sessionParamsSchema },
  responses: {
    200: {
      description: "Booking session wizard state",
      content: {
        "application/json": { schema: z.object({ data: publicBookingSessionStateSchema }) },
      },
    },
    404: {
      description: "Booking session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateSessionStateRoute = createRoute({
  method: "put",
  path: "/sessions/{sessionId}/state",
  request: {
    params: sessionParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: publicUpsertBookingSessionStateSchema } },
    },
  },
  responses: {
    200: {
      description: "Updated booking session wizard state",
      content: {
        "application/json": { schema: z.object({ data: publicBookingSessionStateSchema }) },
      },
    },
    404: {
      description: "Booking session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const repriceSessionRoute = createRoute({
  method: "post",
  path: "/sessions/{sessionId}/reprice",
  request: {
    params: sessionParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: publicRepriceBookingSessionSchema } },
    },
  },
  responses: {
    200: {
      description: "Reprice result for the booking session selections",
      content: {
        "application/json": { schema: z.object({ data: publicBookingSessionRepriceResultSchema }) },
      },
    },
    400: {
      description: "Booking session contains an invalid item selection",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Booking session could not be repriced",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const confirmSessionRoute = createRoute({
  method: "post",
  path: "/sessions/{sessionId}/confirm",
  request: {
    params: sessionParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: publicBookingSessionMutationSchema } },
    },
  },
  responses: {
    200: {
      description: "Confirmed booking session snapshot",
      content: { "application/json": { schema: z.object({ data: publicBookingSessionSchema }) } },
    },
    404: {
      description: "Booking session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Booking session could not be confirmed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const expireSessionRoute = createRoute({
  method: "post",
  path: "/sessions/{sessionId}/expire",
  request: {
    params: sessionParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: publicBookingSessionMutationSchema } },
    },
  },
  responses: {
    200: {
      description: "Expired booking session snapshot",
      content: { "application/json": { schema: z.object({ data: publicBookingSessionSchema }) } },
    },
    404: {
      description: "Booking session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Booking session could not be expired",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const overviewRoute = createRoute({
  method: "get",
  path: "/overview",
  request: { query: publicBookingOverviewAccessQuerySchema },
  responses: {
    200: {
      description: "Guest-facing booking overview",
      content: { "application/json": { schema: z.object({ data: publicBookingOverviewSchema }) } },
    },
    401: {
      description: "Missing guest booking access capability",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking overview not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    429: {
      description: "Too many guest booking lookups",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const guestLookupRoute = createRoute({
  method: "post",
  path: "/guest-lookup",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: publicGuestBookingLookupSchema } },
    },
  },
  responses: {
    200: {
      description: "Booking overview with a guest booking access capability",
      content: {
        "application/json": { schema: z.object({ data: publicGuestBookingLookupResponseSchema }) },
      },
    },
    404: {
      description: "Booking overview not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    429: {
      description: "Too many guest booking lookups",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

// The `idempotencyKey` and session-capability middleware are registered via
// `.use(path, mw)` since `createRoute` has no middleware slot. `OpenAPIHono#use`
// returns the base `Hono` type (honojs/middleware#637), so the middleware is
// attached as statements on the instance (discarding the return value) before
// the `.openapi()` chain — middleware is positional, so it must precede the
// routes it guards.
const publicBookingApp = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
publicBookingApp.use("/sessions/:sessionId", sessionResourceGuard())
publicBookingApp.use("/sessions/:sessionId/state", sessionResourceGuard())
publicBookingApp.use(
  "/sessions/:sessionId/reprice",
  sessionCapability("session:reprice"),
  idempotencyKey(),
)
publicBookingApp.use(
  "/sessions/:sessionId/confirm",
  sessionCapability("session:finalize"),
  idempotencyKey(),
)
publicBookingApp.use(
  "/sessions/:sessionId/expire",
  sessionCapability("session:finalize"),
  idempotencyKey(),
)

export const publicBookingRoutes = publicBookingApp
  .openapi(getSessionRoute, async (c) => {
    const session = await publicBookingsService.getSessionById(
      c.get("db"),
      c.req.valid("param").sessionId,
    )

    return session ? c.json({ data: session }, 200) : notFound(c, "Booking session not found")
  })
  .openapi(updateSessionRoute, async (c) => {
    const result = await publicBookingsService.updateSession(
      c.get("db"),
      c.req.valid("param").sessionId,
      c.req.valid("json"),
      c.get("userId"),
      publicResolvers(c),
    )

    if (result.status === "not_found") {
      return notFound(c, "Booking session not found")
    }

    if (!hasSession(result)) {
      return c.json({ error: sessionConflictError(result.status) }, 409)
    }

    return c.json({ data: result.session }, 200)
  })
  .openapi(getSessionStateRoute, async (c) => {
    const state = await publicBookingsService.getSessionState(
      c.get("db"),
      c.req.valid("param").sessionId,
    )

    return state ? c.json({ data: state }, 200) : notFound(c, "Booking session not found")
  })
  .openapi(updateSessionStateRoute, async (c) => {
    const result = await publicBookingsService.updateSessionState(
      c.get("db"),
      c.req.valid("param").sessionId,
      c.req.valid("json"),
      publicResolvers(c),
      c.get("userId"),
    )

    if (result.status === "not_found") {
      return notFound(c, "Booking session not found")
    }

    return c.json({ data: result.state }, 200)
  })
  .openapi(repriceSessionRoute, async (c) => {
    const result = await publicBookingsService.repriceSession(
      c.get("db"),
      c.req.valid("param").sessionId,
      c.req.valid("json"),
    )

    if (result.status === "not_found") {
      return notFound(c, "Booking session not found")
    }

    if (result.status === "invalid_selection") {
      return c.json({ error: "Booking session contains an invalid item selection" }, 400)
    }

    if (result.status !== "ok") {
      return c.json({ error: sessionConflictError(result.status) }, 409)
    }

    return c.json({ data: { pricing: result.pricing, session: result.session } }, 200)
  })
  .openapi(confirmSessionRoute, async (c) => {
    const result = await publicBookingsService.confirmSession(
      c.get("db"),
      c.req.valid("param").sessionId,
      c.req.valid("json"),
      c.get("userId"),
    )

    if (result.status === "not_found") {
      return notFound(c, "Booking session not found")
    }

    if (!hasSession(result)) {
      return c.json({ error: sessionConflictError(result.status) }, 409)
    }

    return c.json({ data: result.session }, 200)
  })
  .openapi(expireSessionRoute, async (c) => {
    const result = await publicBookingsService.expireSession(
      c.get("db"),
      c.req.valid("param").sessionId,
      c.req.valid("json"),
      c.get("userId"),
      {
        eventBus: c.get("eventBus"),
        closePaymentSchedulesForBooking: getRouteRuntime(c).closePaymentSchedulesForBooking,
      },
    )

    if (result.status === "not_found") {
      return notFound(c, "Booking session not found")
    }

    if (!hasSession(result)) {
      return c.json({ error: sessionConflictError(result.status) }, 409)
    }

    return c.json({ data: result.session }, 200)
  })
  .openapi(overviewRoute, async (c) => {
    const query = c.req.valid("query")
    if (query.email) {
      const rateLimited = await enforceGuestBookingLookupRateLimit(
        c,
        bookingLookupRateLimitKey(query),
        getRuntimeEnv(c),
      )
      if (rateLimited) return guestBookingRateLimitResponse(c, rateLimited)
    }
    const overviewEnrichers = getRouteRuntime(c).overviewItemEnrichers
    const overview = query.email
      ? await publicBookingsService.getOverview(
          c.get("db"),
          {
            bookingId: query.bookingId,
            bookingNumber: query.bookingNumber,
            bookingCode: query.bookingCode,
            email: query.email,
          },
          overviewEnrichers,
        )
      : await publicBookingsService.getOverviewByGuestAccess(c.get("db"), query, overviewEnrichers)
    if (!overview) {
      if (!query.email) {
        throw new UnauthorizedApiError("Missing guest booking access capability")
      }

      return notFound(c, "Booking overview not found")
    }

    if (!query.email) {
      await requireGuestBookingAccess(c, overview.bookingId, "overview:read", getRuntimeEnv(c))
    }

    return c.json({ data: overview }, 200)
  })
  .openapi(guestLookupRoute, async (c) => {
    const input = c.req.valid("json")
    const rateLimited = await enforceGuestBookingLookupRateLimit(
      c,
      input.bookingCode,
      getRuntimeEnv(c),
    )
    if (rateLimited) return guestBookingRateLimitResponse(c, rateLimited)

    const overview = await publicBookingsService.getOverview(
      c.get("db"),
      input,
      getRouteRuntime(c).overviewItemEnrichers,
    )
    if (!overview) {
      return notFound(c, "Booking overview not found")
    }

    const capability = await issueGuestBookingAccess(overview.bookingId, getRuntimeEnv(c))
    c.header("Set-Cookie", guestBookingAccessCookie(capability.token, capability.expiresAt), {
      append: true,
    })

    return c.json({ data: attachGuestBookingAccess(overview, capability) }, 200)
  })

export type PublicBookingRoutes = typeof publicBookingRoutes
