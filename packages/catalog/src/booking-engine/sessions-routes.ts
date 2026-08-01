import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  abandonBookingSessionV1,
  type BookingSessionActorKindV1,
  bookingSessionOutcomeV1,
  commitBookingSessionV1,
  createBookingSessionV1,
  placeBookingHoldV1,
  quoteBookingSessionV1,
  updateBookingSessionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import type { Context } from "hono"
import type { BookingSessionAccessContext, BookingSessionModule } from "./sessions-service.js"

type Env = {
  Variables: Record<string, unknown>
}

export interface BookingSessionRoutesOptions {
  resolveModule(c: Context): BookingSessionModule
  actorKind: BookingSessionActorKindV1
  resolveAccess?(c: Context, actorKind: BookingSessionActorKindV1): BookingSessionAccessContext
}

const sessionParamSchema = z.object({ sessionId: z.string().min(1) })
const errorResponseSchema = z.object({ error: z.string(), code: z.string().optional() })

const createSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions",
  request: {
    body: { required: true, content: { "application/json": { schema: createBookingSessionV1 } } },
  },
  responses: {
    200: {
      description: "Booking Session created",
      content: { "application/json": { schema: bookingSessionOutcomeV1 } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateSessionRoute = createRoute({
  method: "patch",
  path: "/booking-sessions/{sessionId}",
  request: {
    params: sessionParamSchema,
    body: { required: true, content: { "application/json": { schema: updateBookingSessionV1 } } },
  },
  responses: {
    200: {
      description: "Booking Session updated",
      content: { "application/json": { schema: bookingSessionOutcomeV1 } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const quoteSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions/{sessionId}/quote",
  request: {
    params: sessionParamSchema,
    body: { required: true, content: { "application/json": { schema: quoteBookingSessionV1 } } },
  },
  responses: {
    200: {
      description: "Exact-revision Quote created",
      content: { "application/json": { schema: bookingSessionOutcomeV1 } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const holdSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions/{sessionId}/hold",
  request: {
    params: sessionParamSchema,
    body: { required: true, content: { "application/json": { schema: placeBookingHoldV1 } } },
  },
  responses: {
    200: {
      description: "Real-capacity Hold created",
      content: { "application/json": { schema: bookingSessionOutcomeV1 } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const commitSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions/{sessionId}/commit",
  request: {
    params: sessionParamSchema,
    body: { required: true, content: { "application/json": { schema: commitBookingSessionV1 } } },
  },
  responses: {
    200: {
      description: "Admitted Commit outcome",
      content: { "application/json": { schema: bookingSessionOutcomeV1 } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const abandonSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions/{sessionId}/abandon",
  request: {
    params: sessionParamSchema,
    body: { required: true, content: { "application/json": { schema: abandonBookingSessionV1 } } },
  },
  responses: {
    200: {
      description: "Booking Session abandoned",
      content: { "application/json": { schema: bookingSessionOutcomeV1 } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export function createBookingSessionRoutes(options: BookingSessionRoutesOptions): OpenAPIHono<Env> {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(createSessionRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options.resolveModule(c).createSession(
            {
              ...c.req.valid("json"),
            },
            resolveAccess(options, c),
          ),
        ),
      ),
    )
    .openapi(updateSessionRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .updateSession(
              c.req.valid("param").sessionId,
              c.req.valid("json"),
              resolveAccess(options, c),
            ),
        ),
      ),
    )
    .openapi(quoteSessionRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .quoteSession(
              c.req.valid("param").sessionId,
              c.req.valid("json"),
              resolveAccess(options, c),
            ),
        ),
      ),
    )
    .openapi(holdSessionRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .placeHold(
              c.req.valid("param").sessionId,
              c.req.valid("json"),
              resolveAccess(options, c),
            ),
        ),
      ),
    )
    .openapi(abandonSessionRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .abandonSession(
              c.req.valid("param").sessionId,
              c.req.valid("json"),
              resolveAccess(options, c),
            ),
        ),
      ),
    )
    .openapi(commitSessionRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .commitSession(
              c.req.valid("param").sessionId,
              c.req.valid("json"),
              resolveAccess(options, c),
            ),
        ),
      ),
    )
}

// biome-ignore lint/suspicious/noExplicitAny: bridges plain Hono responses to zod-openapi's inferred route union.
function asRouteResponse(response: Response): any {
  return response
}

function resolveAccess(
  options: BookingSessionRoutesOptions,
  c: Context,
): BookingSessionAccessContext {
  return (
    options.resolveAccess?.(c, options.actorKind) ?? {
      actorKind: options.actorKind,
      ...(options.actorKind === "anonymous" ? { capability: readAnonymousCapability(c) } : {}),
    }
  )
}

function readAnonymousCapability(c: Context): string | undefined {
  const header = c.req.header("Voyant-Booking-Session-Capability")?.trim()
  if (header) return header
  const cookie = c.req.header("Cookie")
  const match = cookie?.match(/(?:^|;\s*)voyant_booking_session=([^;]+)/)
  return match ? decodeURIComponent(match[1] ?? "") : undefined
}

export function createBookingSessionApiModule(options: {
  resolveModule(c: Context): BookingSessionModule
}): ApiModule {
  return {
    module: { name: "catalog" },
    adminRoutes: createBookingSessionRoutes({
      ...options,
      actorKind: "staff",
      resolveAccess: (c) => {
        const vars = c.var as { userId?: unknown; organizationId?: unknown }
        const principalId = typeof vars.userId === "string" ? vars.userId.trim() : ""
        const organizationId =
          typeof vars.organizationId === "string" ? vars.organizationId.trim() : ""
        return {
          actorKind: "staff",
          ...(principalId ? { principalId } : {}),
          ...(organizationId ? { organizationId } : {}),
        }
      },
    }),
    publicRoutes: createBookingSessionRoutes({ ...options, actorKind: "anonymous" }),
  }
}
