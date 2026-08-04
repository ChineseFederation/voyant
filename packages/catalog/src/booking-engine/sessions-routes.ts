import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  offerPreviewOutcomeV1,
  offerPreviewRequestV1,
} from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"
import {
  abandonBookingSessionV1,
  adoptBookingSessionV1,
  type BookingSessionActorKindV1,
  bookingSessionOutcomeV1,
  commitBookingSessionV1,
  createBookingSessionV1,
  placeBookingHoldV1,
  quoteBookingSessionV1,
  renewBookingSessionV1,
  updateBookingSessionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import {
  listSupplierOperationsQueryV1,
  reconcileSupplierOperationV1,
  resolveSupplierOperationV1,
  supplierOperationRecordV1,
} from "@voyant-travel/catalog-contracts/booking-engine/supplier-operations"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import type { Context } from "hono"
import type { BookingSessionAccessContext, BookingSessionModule } from "./sessions-service.js"
import type { SupplierOperationOperatorService } from "./supplier-operations-operator.js"

type Env = {
  Variables: Record<string, unknown> & {
    storefrontChannel?: {
      storefrontId: string
      channelId: string
      channelStatus?: string | null
    }
  }
}

export interface BookingSessionRoutesOptions {
  resolveModule(c: Context, dbOverride?: unknown): BookingSessionModule
  actorKind: BookingSessionActorKindV1
  resolveAccess?(c: Context, actorKind: BookingSessionActorKindV1): BookingSessionAccessContext
  resolveSupplierOperations?(c: Context): SupplierOperationOperatorService
}

const sessionParamSchema = z.object({ sessionId: z.string().min(1) })
const errorResponseSchema = z.object({ error: z.string(), code: z.string().optional() })
const bookingSessionOutcomeOpenApiSchema = z
  .lazy(() => bookingSessionOutcomeV1)
  .openapi("BookingSessionOutcomeV1")
const supplierOperationRecordOpenApiSchema = z
  .lazy(() => supplierOperationRecordV1)
  .openapi("SupplierOperationRecordV1")
const offerPreviewOutcomeOpenApiSchema = z
  .lazy(() => offerPreviewOutcomeV1)
  .openapi("OfferPreviewOutcomeV1")

/**
 * The non-binding read a storefront detail page uses before any Booking
 * Session exists. Deliberately not under `/booking-sessions`: it creates none,
 * and nesting it there would invite a host to believe it had one.
 */
const previewOfferRoute = createRoute({
  method: "post",
  path: "/offers/preview",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: offerPreviewRequestV1 } },
    },
  },
  responses: {
    200: {
      description: "Non-binding Offer Preview — no identifier, nothing persisted",
      content: { "application/json": { schema: offerPreviewOutcomeOpenApiSchema } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Active storefront channel context is required for public offer previews",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const createSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createBookingSessionV1 } },
    },
  },
  responses: {
    200: {
      description: "Booking Session created",
      content: { "application/json": { schema: bookingSessionOutcomeOpenApiSchema } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Active storefront channel context is required for public booking sessions",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateSessionRoute = createRoute({
  method: "patch",
  path: "/booking-sessions/{sessionId}",
  request: {
    params: sessionParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateBookingSessionV1 } },
    },
  },
  responses: {
    200: {
      description: "Booking Session updated",
      content: { "application/json": { schema: bookingSessionOutcomeOpenApiSchema } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Active storefront channel context is required for public booking sessions",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const resumeSessionRoute = createRoute({
  method: "get",
  path: "/booking-sessions/{sessionId}",
  request: { params: sessionParamSchema },
  responses: {
    200: {
      description: "Authorized, redacted Booking Session view",
      content: { "application/json": { schema: bookingSessionOutcomeOpenApiSchema } },
    },
    403: {
      description: "Active storefront channel context is required for public booking sessions",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const adoptSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions/{sessionId}/adopt",
  request: {
    params: sessionParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: adoptBookingSessionV1 } },
    },
  },
  responses: {
    200: {
      description: "Anonymous Booking Session atomically adopted by the authenticated customer",
      content: { "application/json": { schema: bookingSessionOutcomeOpenApiSchema } },
    },
    403: {
      description: "Active storefront channel context is required for public booking sessions",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const renewSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions/{sessionId}/renew",
  request: {
    params: sessionParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: renewBookingSessionV1 } },
    },
  },
  responses: {
    200: {
      description: "Policy-limited Booking Session renewal",
      content: { "application/json": { schema: bookingSessionOutcomeOpenApiSchema } },
    },
    403: {
      description: "Active storefront channel context is required for public booking sessions",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const quoteSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions/{sessionId}/quote",
  request: {
    params: sessionParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: quoteBookingSessionV1 } },
    },
  },
  responses: {
    200: {
      description: "Exact-revision Quote created",
      content: { "application/json": { schema: bookingSessionOutcomeOpenApiSchema } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Active storefront channel context is required for public booking sessions",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const holdSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions/{sessionId}/hold",
  request: {
    params: sessionParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: placeBookingHoldV1 } },
    },
  },
  responses: {
    200: {
      description: "Real-capacity Hold created",
      content: { "application/json": { schema: bookingSessionOutcomeOpenApiSchema } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Active storefront channel context is required for public booking sessions",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const commitSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions/{sessionId}/commit",
  request: {
    params: sessionParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: commitBookingSessionV1 } },
    },
  },
  responses: {
    200: {
      description: "Admitted Commit outcome",
      content: { "application/json": { schema: bookingSessionOutcomeOpenApiSchema } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Active storefront channel context is required for public booking sessions",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const abandonSessionRoute = createRoute({
  method: "post",
  path: "/booking-sessions/{sessionId}/abandon",
  request: {
    params: sessionParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: abandonBookingSessionV1 } },
    },
  },
  responses: {
    200: {
      description: "Booking Session abandoned",
      content: { "application/json": { schema: bookingSessionOutcomeOpenApiSchema } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Active storefront channel context is required for public booking sessions",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const expireDueSessionsRoute = createRoute({
  method: "post",
  path: "/booking-sessions/maintenance/expire",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: z.object({ limit: z.number().int().positive() }) } },
    },
  },
  responses: {
    200: {
      description: "Expired Booking Sessions fenced and Holds released",
      content: { "application/json": { schema: z.object({ expired: z.number().int().min(0) }) } },
    },
  },
})

const purgeSessionsRoute = createRoute({
  method: "post",
  path: "/booking-sessions/maintenance/purge",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({ before: z.string().datetime(), limit: z.number().int().positive() }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Terminal Booking Session PII purged under retention policy",
      content: { "application/json": { schema: z.object({ purged: z.number().int().min(0) }) } },
    },
  },
})

const supplierOperationParamSchema = z.object({ operationId: z.string().min(1) })

const listSupplierOperationsRoute = createRoute({
  method: "get",
  path: "/supplier-operations",
  request: { query: listSupplierOperationsQueryV1 },
  responses: {
    200: {
      description: "Supplier Operations",
      content: {
        "application/json": {
          schema: z.object({ operations: z.array(supplierOperationRecordOpenApiSchema) }),
        },
      },
    },
  },
})

const getSupplierOperationRoute = createRoute({
  method: "get",
  path: "/supplier-operations/{operationId}",
  request: { params: supplierOperationParamSchema },
  responses: {
    200: {
      description: "Supplier Operation",
      content: { "application/json": { schema: supplierOperationRecordOpenApiSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const reconcileSupplierOperationRoute = createRoute({
  method: "post",
  path: "/supplier-operations/{operationId}/reconcile",
  request: {
    params: supplierOperationParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: reconcileSupplierOperationV1 } },
    },
  },
  responses: {
    200: {
      description: "Reconciled Supplier Operation",
      content: { "application/json": { schema: supplierOperationRecordOpenApiSchema } },
    },
  },
})

const resolveSupplierOperationRoute = createRoute({
  method: "post",
  path: "/supplier-operations/{operationId}/resolve",
  request: {
    params: supplierOperationParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: resolveSupplierOperationV1 } },
    },
  },
  responses: {
    200: {
      description: "Manually resolved Supplier Operation",
      content: { "application/json": { schema: supplierOperationRecordOpenApiSchema } },
    },
  },
})

export function createBookingSessionRoutes(options: BookingSessionRoutesOptions): OpenAPIHono<Env> {
  const routes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  if (options.actorKind === "anonymous") {
    routes.use("*", async (c, next) => {
      if (!activeStorefront(c)) {
        return c.json(
          {
            error: "Active storefront channel context is required.",
            code: "active_storefront_channel_required",
          },
          403,
        )
      }
      return next()
    })
  }

  routes
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
    .openapi(resumeSessionRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .resumeSession(c.req.valid("param").sessionId, resolveAccess(options, c)),
        ),
      ),
    )
    .openapi(adoptSessionRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .adoptSession(
              c.req.valid("param").sessionId,
              c.req.valid("json"),
              resolveAccess(options, c),
            ),
        ),
      ),
    )
    .openapi(renewSessionRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .renewSession(
              c.req.valid("param").sessionId,
              c.req.valid("json"),
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
    .openapi(previewOfferRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .previewOffer(c.req.valid("json"), resolveAccess(options, c)),
        ),
      ),
    )

  if (options.actorKind !== "staff") return routes

  const staffRoutes = routes
    .openapi(expireDueSessionsRoute, async (c) =>
      asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .expireDueSessions(c.req.valid("json"), resolveAccess(options, c)),
        ),
      ),
    )
    .openapi(purgeSessionsRoute, async (c) => {
      const input = c.req.valid("json")
      return asRouteResponse(
        c.json(
          await options
            .resolveModule(c)
            .purgeTerminalSessions(
              { before: new Date(input.before), limit: input.limit },
              resolveAccess(options, c),
            ),
        ),
      )
    })

  if (!options.resolveSupplierOperations) return staffRoutes
  const resolveSupplierOperations = options.resolveSupplierOperations
  return staffRoutes
    .openapi(listSupplierOperationsRoute, async (c) =>
      asRouteResponse(
        c.json({
          operations: await resolveSupplierOperations(c).list(
            c.req.valid("query"),
            resolveAccess(options, c),
          ),
        }),
      ),
    )
    .openapi(getSupplierOperationRoute, async (c) => {
      const operation = await resolveSupplierOperations(c).get(
        c.req.valid("param").operationId,
        resolveAccess(options, c),
      )
      return asRouteResponse(
        operation
          ? c.json(operation)
          : c.json({ error: "Supplier Operation not found", code: "not_found" }, 404),
      )
    })
    .openapi(reconcileSupplierOperationRoute, async (c) =>
      asRouteResponse(
        c.json(
          await resolveSupplierOperations(c).reconcile(
            c.req.valid("param").operationId,
            c.req.valid("json"),
            resolveAccess(options, c),
          ),
        ),
      ),
    )
    .openapi(resolveSupplierOperationRoute, async (c) =>
      asRouteResponse(
        c.json(
          await resolveSupplierOperations(c).resolve(
            c.req.valid("param").operationId,
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
  const resolved = options.resolveAccess?.(c, options.actorKind) ?? {
    actorKind: options.actorKind,
    ...(options.actorKind === "anonymous" ? { capability: readAnonymousCapability(c) } : {}),
  }
  if (options.actorKind !== "anonymous") return resolved

  // The anonymous middleware has already rejected a missing/inactive binding.
  // Re-read the trusted Hono variable here so no custom access resolver can
  // substitute body or session-state storefront identifiers.
  const storefront = activeStorefront(c as Context<Env>)
  return { ...resolved, ...(storefront ? { storefront } : {}) }
}

function activeStorefront(c: Context<Env>) {
  const storefrontChannel = c.get("storefrontChannel")
  const storefrontId = storefrontChannel?.storefrontId.trim() ?? ""
  const channelId = storefrontChannel?.channelId.trim() ?? ""
  if (!storefrontId || !channelId || storefrontChannel?.channelStatus !== "active") {
    return null
  }
  return {
    storefrontId,
    channelId,
  }
}

function readAnonymousCapability(c: Context): string | undefined {
  return c.req.header("Voyant-Booking-Session-Capability")?.trim() || undefined
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
        const vars = c.var as {
          userId?: unknown
          organizationId?: unknown
          bookingSessionAuthority?: unknown
        }
        const principalId = typeof vars.userId === "string" ? vars.userId.trim() : ""
        const organizationId =
          typeof vars.organizationId === "string" ? vars.organizationId.trim() : ""
        const authority = vars.bookingSessionAuthority
        const authorityReason =
          authority && typeof authority === "object" && "reason" in authority
            ? String(Reflect.get(authority, "reason")).trim()
            : ""
        return {
          actorKind: "staff",
          ...(principalId ? { principalId } : {}),
          ...(organizationId ? { organizationId } : {}),
          ...(authorityReason
            ? { staffAuthority: { admitted: true as const, reason: authorityReason } }
            : {}),
        }
      },
    }),
    publicRoutes: createBookingSessionRoutes({
      ...options,
      actorKind: "anonymous",
      resolveAccess: (c) => {
        const vars = c.var as {
          actor?: unknown
          realm?: unknown
          userId?: unknown
          organizationId?: unknown
        }
        const capability = readAnonymousCapability(c)
        if (vars.actor === "customer" && vars.realm === "customer") {
          const principalId = typeof vars.userId === "string" ? vars.userId.trim() : ""
          const organizationId =
            typeof vars.organizationId === "string" ? vars.organizationId.trim() : ""
          return {
            actorKind: "customer",
            ...(principalId ? { principalId } : {}),
            ...(organizationId ? { organizationId } : {}),
            ...(capability ? { capability } : {}),
          }
        }
        return { actorKind: "anonymous", ...(capability ? { capability } : {}) }
      },
    }),
    anonymous: true,
    optionalCustomerAuth: true,
  }
}
