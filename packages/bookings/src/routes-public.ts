import { OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook, UnauthorizedApiError } from "@voyant-travel/hono"
import type { Context, MiddlewareHandler } from "hono"

import {
  guestBookingAccessActions,
  guestBookingAccessCookie,
  issueGuestBookingAccess,
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
import { getBookingOriginByBookingId } from "./service-origin.js"
import { publicBookingsService } from "./service-public.js"
import {
  publicBookingOverviewAccessQuerySchema,
  publicBookingOverviewSchema,
  publicGuestBookingLookupResponseSchema,
  publicGuestBookingLookupSchema,
} from "./validation-public.js"

const errorResponseSchema = z.object({ error: z.string() })

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

function activeStorefrontOrigin(c: Context<Env>) {
  const storefrontChannel = c.get("storefrontChannel")
  if (
    !storefrontChannel?.storefrontId ||
    !storefrontChannel.channelId ||
    storefrontChannel.channelStatus !== "active"
  ) {
    return null
  }

  return {
    storefrontId: storefrontChannel.storefrontId,
    channelId: storefrontChannel.channelId,
  }
}

export function activeStorefrontChannelGuard(): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (!activeStorefrontOrigin(c)) {
      return c.json({ error: "active_storefront_channel_required" }, 403)
    }
    await next()
  }
}

export async function requireBookingStorefrontOrigin(c: Context<Env>, bookingId: string) {
  const requestOrigin = activeStorefrontOrigin(c)
  if (!requestOrigin) {
    return c.json({ error: "active_storefront_channel_required" }, 403)
  }

  const bookingOrigin = await getBookingOriginByBookingId(c.get("db"), bookingId)
  if (
    bookingOrigin?.storefrontId !== requestOrigin.storefrontId ||
    bookingOrigin.channelId !== requestOrigin.channelId
  ) {
    return c.json({ error: "booking_storefront_origin_mismatch" }, 403)
  }

  return null
}

const overviewRoute = createRoute({
  method: "get",
  path: "/overview",
  request: { query: publicBookingOverviewAccessQuerySchema },
  responses: {
    200: {
      description: "Guest-facing committed Booking overview",
      content: { "application/json": { schema: z.object({ data: publicBookingOverviewSchema }) } },
    },
    401: {
      description: "Missing guest Booking access capability",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Missing or mismatched active storefront channel context",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking overview not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    429: {
      description: "Too many guest Booking lookups",
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
      description: "Committed Booking overview with a guest access capability",
      content: {
        "application/json": { schema: z.object({ data: publicGuestBookingLookupResponseSchema }) },
      },
    },
    403: {
      description: "Missing or mismatched active storefront channel context",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking overview not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    429: {
      description: "Too many guest Booking lookups",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const publicBookingApp = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
publicBookingApp.use("/overview", activeStorefrontChannelGuard())
publicBookingApp.use("/guest-lookup", activeStorefrontChannelGuard())

export const publicBookingRoutes = publicBookingApp
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
        throw new UnauthorizedApiError("Missing guest Booking access capability")
      }

      return notFound(c, "Booking overview not found")
    }

    if (!query.email) {
      await requireGuestBookingAccess(c, overview.bookingId, "overview:read", getRuntimeEnv(c))
    }

    const denied = await requireBookingStorefrontOrigin(c, overview.bookingId)
    if (denied) return denied

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

    const denied = await requireBookingStorefrontOrigin(c, overview.bookingId)
    if (denied) return denied

    const capability = await issueGuestBookingAccess(overview.bookingId, getRuntimeEnv(c))
    c.header("Set-Cookie", guestBookingAccessCookie(capability.token, capability.expiresAt), {
      append: true,
    })

    return c.json({ data: attachGuestBookingAccess(overview, capability) }, 200)
  })

export type PublicBookingRoutes = typeof publicBookingRoutes
