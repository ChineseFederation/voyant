// agent-quality: file-size exception -- owner: bookings; staff and customer Amendment routes share one set of schemas, outcome mappings, and service handlers.
import { OpenAPIHono, z } from "@hono/zod-openapi"
import {
  acceptBookingAmendmentSchema,
  applyBookingAmendmentSchema,
  bookingAmendmentSchema,
  previewTravelerCorrectionSchema,
  previewTravelerRosterChangeSchema,
} from "@voyant-travel/bookings-contracts"
import { idempotencyKey, isStaffRbacEnforced, openApiValidationHook } from "@voyant-travel/hono"
import type { Context } from "hono"

import { type GuestBookingAccessAction, requireGuestBookingAccess } from "./checkout-capability.js"
import { redactTravelerIdentity, shouldRevealBookingPii } from "./pii-redaction.js"
import { BOOKING_ROUTE_RUNTIME_CONTAINER_KEY, type BookingRouteRuntime } from "./route-runtime.js"
import { createBookingsAdminRoute, createBookingsPublicRoute } from "./routes-openapi.js"
import { requireBookingStorefrontOrigin } from "./routes-public.js"
import { type Env, getRuntimeEnv } from "./routes-shared.js"
import { bookingPiiAccessLog } from "./schema.js"
import {
  type BookingAmendmentCommandContext,
  bookingAmendmentService,
} from "./service-amendments.js"

const amendmentParamsSchema = z.object({ bookingId: z.string(), amendmentId: z.string() })
const bookingParamsSchema = z.object({ bookingId: z.string() })
const errorSchema = z.object({
  error: z.string(),
  currentBookingRevision: z.number().int().positive().optional(),
  bookingItemId: z.string().optional(),
  reason: z.string().optional(),
})
const bookingAmendmentOpenApiSchema = bookingAmendmentSchema.openapi("BookingAmendment")
const amendmentDataSchema = z.object({ data: bookingAmendmentOpenApiSchema })
const amendmentListDataSchema = z.object({ data: z.array(bookingAmendmentOpenApiSchema) })
const amendmentOkDataSchema = z
  .object({
    data: z.object({
      status: z.literal("ok"),
      amendment: bookingAmendmentOpenApiSchema,
    }),
  })
  .openapi("BookingAmendmentOkResponse")
const previewNoOpDataSchema = z
  .object({
    data: z.object({
      status: z.literal("no_op"),
      bookingId: z.string(),
      travelerId: z.string(),
      bookingRevision: z.number().int().positive(),
    }),
  })
  .openapi("BookingAmendmentPreviewNoOpResponse")
const applyPendingDataSchema = z
  .object({
    data: z.object({
      status: z.enum(["supplier_pending", "supplier_in_doubt", "manual_review"]),
      amendment: bookingAmendmentOpenApiSchema,
    }),
  })
  .openapi("BookingAmendmentApplyPendingResponse")
const applyRefusedDataSchema = z
  .object({
    data: z.object({
      status: z.literal("supplier_refused"),
      amendment: bookingAmendmentOpenApiSchema,
    }),
  })
  .openapi("BookingAmendmentApplyRefusedResponse")
const applyConflictDataSchema = z
  .union([errorSchema, applyRefusedDataSchema])
  .openapi("BookingAmendmentApplyConflictResponse")
const publicForbiddenResponse = {
  description: "Missing or mismatched Booking access",
  content: { "application/json": { schema: errorSchema } },
} as const
const idempotencyRequiredResponse = {
  description: "Missing or invalid Idempotency-Key header",
  content: { "application/json": { schema: errorSchema } },
} as const

function mutationContext(
  c: Context<Env>,
  actor: BookingAmendmentCommandContext["actor"],
): BookingAmendmentCommandContext {
  const key = c.get("idempotencyKey")
  if (!key) throw new Error("Booking Amendment mutation requires an idempotency key")
  return {
    actor,
    actorId: c.get("userId") ?? c.get("relationshipPersonId") ?? null,
    idempotencyKey: key,
  }
}

function amendmentDependencies(c: Context<Env>) {
  const runtime = c
    .get("container")
    ?.resolve<BookingRouteRuntime>(BOOKING_ROUTE_RUNTIME_CONTAINER_KEY)
  return {
    finance: runtime?.amendmentFinance,
    supplier: runtime?.amendmentSupplier,
  }
}

function amendmentError(
  c: Context<Env>,
  result: {
    status: string
    currentBookingRevision?: number
    bookingItemId?: string
    reason?: string
  },
) {
  if (result.status === "not_found") return c.json({ error: "amendment_not_found" }, 404)
  if (result.status === "stale_revision") {
    return c.json(
      {
        error: "stale_revision",
        currentBookingRevision: result.currentBookingRevision,
      },
      409,
    )
  }
  return c.json(
    {
      error: result.status,
      ...(result.bookingItemId ? { bookingItemId: result.bookingItemId } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
    },
    409,
  )
}

function redactAmendmentHistory(amendment: z.infer<typeof bookingAmendmentSchema>) {
  return {
    ...amendment,
    revisions: amendment.revisions?.map((revision) => ({
      ...revision,
      snapshot: {
        ...revision.snapshot,
        travelers: revision.snapshot.travelers.map((traveler) => ({
          ...redactTravelerIdentity(traveler),
          personId: null,
        })),
      },
    })),
  }
}

function publicAmendmentHistory(amendment: z.infer<typeof bookingAmendmentSchema>) {
  return {
    ...amendment,
    requestedBy: null,
    acceptedBy: null,
    appliedBy: null,
    revisions: amendment.revisions?.map((revision) => ({
      ...revision,
      authorizedBy: null,
      snapshot: {
        ...revision.snapshot,
        travelers: revision.snapshot.travelers.map((traveler) => ({
          ...traveler,
          personId: null,
        })),
      },
    })),
  }
}

async function logAmendmentHistoryRead(
  c: Context<Env>,
  bookingId: string,
  reveal: boolean,
  metadata: Record<string, unknown>,
  travelerId?: string,
) {
  await c
    .get("db")
    .insert(bookingPiiAccessLog)
    .values({
      bookingId,
      travelerId,
      actorId: c.get("userId") ?? null,
      actorType: c.get("actor") ?? null,
      callerType: c.get("callerType") ?? null,
      action: "read",
      outcome: "allowed",
      reason: reveal ? "amendment_history_reveal" : "amendment_history_redacted",
      metadata: { ...metadata, reveal },
    })
}

function shouldRevealAdminHistory(c: Context<Env>) {
  return shouldRevealBookingPii({
    actor: c.get("actor"),
    scopes: c.get("scopes"),
    callerType: c.get("callerType"),
    isInternalRequest: c.get("isInternalRequest"),
    enforceRbac: isStaffRbacEnforced(c.env),
  })
}

async function visibleAdminAmendment(
  c: Context<Env>,
  amendment: z.infer<typeof bookingAmendmentSchema>,
  metadata: Record<string, unknown>,
) {
  const reveal = shouldRevealAdminHistory(c)
  await logAmendmentHistoryRead(c, amendment.bookingId, reveal, metadata, amendment.travelerId)
  return reveal ? amendment : redactAmendmentHistory(amendment)
}

async function auditedPublicAmendment(
  c: Context<Env>,
  amendment: z.infer<typeof bookingAmendmentSchema>,
  metadata: Record<string, unknown>,
) {
  await logAmendmentHistoryRead(c, amendment.bookingId, true, metadata, amendment.travelerId)
  return publicAmendmentHistory(amendment)
}

const adminPreviewRoute = createBookingsAdminRoute({
  method: "post",
  path: "/{bookingId}/amendments/traveler-corrections/preview",
  request: {
    params: bookingParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: previewTravelerCorrectionSchema } },
    },
  },
  responses: {
    400: idempotencyRequiredResponse,
    201: {
      description: "Traveler correction preview",
      content: { "application/json": { schema: amendmentOkDataSchema } },
    },
    200: {
      description: "Idempotent or no-op preview",
      content: { "application/json": { schema: previewNoOpDataSchema } },
    },
    404: {
      description: "Booking or traveler not found",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "Revision or idempotency conflict",
      content: { "application/json": { schema: errorSchema } },
    },
  },
})

const adminRosterPreviewRoute = createBookingsAdminRoute({
  method: "post",
  path: "/{bookingId}/amendments/traveler-roster/preview",
  request: {
    params: bookingParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: previewTravelerRosterChangeSchema } },
    },
  },
  responses: adminPreviewRoute.responses,
})

const adminListRoute = createBookingsAdminRoute({
  method: "get",
  path: "/{bookingId}/amendments",
  request: { params: bookingParamsSchema },
  responses: {
    200: {
      description: "Booking Amendment history",
      content: { "application/json": { schema: amendmentListDataSchema } },
    },
  },
})

const adminGetRoute = createBookingsAdminRoute({
  method: "get",
  path: "/{bookingId}/amendments/{amendmentId}",
  request: { params: amendmentParamsSchema },
  responses: {
    200: {
      description: "Booking Amendment",
      content: { "application/json": { schema: amendmentDataSchema } },
    },
    404: {
      description: "Booking Amendment not found",
      content: { "application/json": { schema: errorSchema } },
    },
  },
})

const adminAcceptRoute = createBookingsAdminRoute({
  method: "post",
  path: "/{bookingId}/amendments/{amendmentId}/accept",
  request: {
    params: amendmentParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: acceptBookingAmendmentSchema } },
    },
  },
  responses: {
    400: idempotencyRequiredResponse,
    200: {
      description: "Accepted Booking Amendment",
      content: { "application/json": { schema: amendmentDataSchema } },
    },
    404: {
      description: "Booking Amendment not found",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "Acceptance conflict",
      content: { "application/json": { schema: errorSchema } },
    },
  },
})

const adminApplyRoute = createBookingsAdminRoute({
  method: "post",
  path: "/{bookingId}/amendments/{amendmentId}/apply",
  request: {
    params: amendmentParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: applyBookingAmendmentSchema } },
    },
  },
  responses: {
    400: idempotencyRequiredResponse,
    200: {
      description: "Applied Booking Amendment",
      content: { "application/json": { schema: amendmentOkDataSchema } },
    },
    202: {
      description: "Booking Amendment is waiting for supplier reconciliation",
      content: { "application/json": { schema: applyPendingDataSchema } },
    },
    404: {
      description: "Booking Amendment not found",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "Apply conflict",
      content: { "application/json": { schema: applyConflictDataSchema } },
    },
  },
})

const adminReconcileRoute = createBookingsAdminRoute({
  method: "post",
  path: "/{bookingId}/amendments/{amendmentId}/reconcile",
  request: { params: amendmentParamsSchema },
  responses: adminApplyRoute.responses,
})

const adminApp = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
adminApp.use(
  "/:bookingId/amendments/traveler-corrections/preview",
  idempotencyKey<Env["Bindings"], Env["Variables"]>({ required: true }),
)
adminApp.use(
  "/:bookingId/amendments/traveler-roster/preview",
  idempotencyKey<Env["Bindings"], Env["Variables"]>({ required: true }),
)
adminApp.use(
  "/:bookingId/amendments/:amendmentId/accept",
  idempotencyKey<Env["Bindings"], Env["Variables"]>({ required: true }),
)
adminApp.use(
  "/:bookingId/amendments/:amendmentId/apply",
  idempotencyKey<Env["Bindings"], Env["Variables"]>({ required: true }),
)
adminApp.use(
  "/:bookingId/amendments/:amendmentId/reconcile",
  idempotencyKey<Env["Bindings"], Env["Variables"]>({ required: true }),
)

export const bookingAmendmentAdminRoutes = adminApp
  .openapi(adminPreviewRoute, async (c) => {
    const result = await bookingAmendmentService.previewTravelerCorrection(
      c.get("db"),
      c.req.valid("param").bookingId,
      c.req.valid("json"),
      mutationContext(c, "staff"),
      amendmentDependencies(c),
    )
    if (result.status === "ok") {
      return c.json(
        {
          data: {
            ...result,
            amendment: await visibleAdminAmendment(c, result.amendment, {
              amendmentId: result.amendment.id,
              operation: "preview",
            }),
          },
        },
        201,
      )
    }
    if (result.status === "no_op") return c.json({ data: result }, 200)
    return amendmentError(c, result)
  })
  .openapi(adminRosterPreviewRoute, async (c) => {
    const result = await bookingAmendmentService.previewTravelerRosterChange(
      c.get("db"),
      c.req.valid("param").bookingId,
      c.req.valid("json"),
      mutationContext(c, "staff"),
      amendmentDependencies(c),
    )
    if (result.status === "ok") {
      return c.json(
        {
          data: {
            ...result,
            amendment: await visibleAdminAmendment(c, result.amendment, {
              amendmentId: result.amendment.id,
              operation: "preview_roster_change",
            }),
          },
        },
        201,
      )
    }
    return amendmentError(c, result)
  })
  .openapi(adminListRoute, async (c) => {
    const bookingId = c.req.valid("param").bookingId
    const rows = await bookingAmendmentService.list(c.get("db"), bookingId)
    const reveal = shouldRevealAdminHistory(c)
    await logAmendmentHistoryRead(c, bookingId, reveal, { rowCount: rows.length })
    return c.json({ data: reveal ? rows : rows.map(redactAmendmentHistory) }, 200)
  })
  .openapi(adminGetRoute, async (c) => {
    const { bookingId, amendmentId } = c.req.valid("param")
    const row = await bookingAmendmentService.get(c.get("db"), bookingId, amendmentId)
    if (!row) return c.json({ error: "amendment_not_found" }, 404)
    const reveal = shouldRevealAdminHistory(c)
    await logAmendmentHistoryRead(c, bookingId, reveal, { amendmentId }, row.travelerId)
    return c.json({ data: reveal ? row : redactAmendmentHistory(row) }, 200)
  })
  .openapi(adminAcceptRoute, async (c) => {
    const { bookingId, amendmentId } = c.req.valid("param")
    const existing = await bookingAmendmentService.get(c.get("db"), bookingId, amendmentId)
    if (!existing) return c.json({ error: "amendment_not_found" }, 404)
    const result = await bookingAmendmentService.accept(
      c.get("db"),
      amendmentId,
      c.req.valid("json").proposedRevisionId,
      mutationContext(c, "staff"),
      amendmentDependencies(c),
    )
    if (result.status === "ok" || result.status === "already_applied") {
      return c.json(
        {
          data: await visibleAdminAmendment(c, result.amendment, {
            amendmentId,
            operation: "accept",
          }),
        },
        200,
      )
    }
    return amendmentError(c, result)
  })
  .openapi(adminApplyRoute, async (c) => {
    const { bookingId, amendmentId } = c.req.valid("param")
    const existing = await bookingAmendmentService.get(c.get("db"), bookingId, amendmentId)
    if (!existing) return c.json({ error: "amendment_not_found" }, 404)
    const result = await bookingAmendmentService.apply(
      c.get("db"),
      amendmentId,
      c.req.valid("json"),
      mutationContext(c, "staff"),
      amendmentDependencies(c),
    )
    if (result.status === "ok") {
      const amendment = await visibleAdminAmendment(c, result.amendment, {
        amendmentId,
        operation: "apply",
      })
      return c.json({ data: { status: "ok" as const, amendment } }, 200)
    }
    if (result.status === "supplier_refused") {
      const amendment = await visibleAdminAmendment(c, result.amendment, {
        amendmentId,
        operation: "apply",
      })
      return c.json({ data: { status: "supplier_refused" as const, amendment } }, 409)
    }
    if (
      result.status === "supplier_pending" ||
      result.status === "supplier_in_doubt" ||
      result.status === "manual_review"
    ) {
      const amendment = await visibleAdminAmendment(c, result.amendment, {
        amendmentId,
        operation: "apply",
      })
      return c.json({ data: { status: result.status, amendment } }, 202)
    }
    return amendmentError(c, result)
  })
  .openapi(adminReconcileRoute, async (c) => {
    const { bookingId, amendmentId } = c.req.valid("param")
    const result = await bookingAmendmentService.reconcile(
      c.get("db"),
      bookingId,
      amendmentId,
      mutationContext(c, "staff"),
      amendmentDependencies(c),
    )
    if (result.status === "ok") {
      const amendment = await visibleAdminAmendment(c, result.amendment, {
        amendmentId,
        operation: "reconcile",
      })
      return c.json({ data: { status: "ok" as const, amendment } }, 200)
    }
    if (result.status === "supplier_refused") {
      const amendment = await visibleAdminAmendment(c, result.amendment, {
        amendmentId,
        operation: "reconcile",
      })
      return c.json({ data: { status: "supplier_refused" as const, amendment } }, 409)
    }
    if (
      result.status === "supplier_pending" ||
      result.status === "supplier_in_doubt" ||
      result.status === "manual_review"
    ) {
      const amendment = await visibleAdminAmendment(c, result.amendment, {
        amendmentId,
        operation: "reconcile",
      })
      return c.json({ data: { status: result.status, amendment } }, 202)
    }
    return amendmentError(c, result)
  })

async function requirePublicAccess(
  c: Context<Env>,
  bookingId: string,
  action: GuestBookingAccessAction,
) {
  const denied = await requireBookingStorefrontOrigin(c, bookingId)
  if (denied) return denied

  if (c.get("realm") === "customer") {
    const owned = await bookingAmendmentService.customerCanAccess(c.get("db"), bookingId, {
      personId: c.get("relationshipPersonId"),
      organizationId: c.get("relationshipOrganizationId") ?? c.get("authOrganizationId"),
    })
    if (owned) return null
  }

  await requireGuestBookingAccess(c, bookingId, action, getRuntimeEnv(c))
  return null
}

const publicPreviewRoute = createBookingsPublicRoute({
  method: "post",
  path: "/{bookingId}/amendments/traveler-corrections/preview",
  request: adminPreviewRoute.request,
  responses: { ...adminPreviewRoute.responses, 403: publicForbiddenResponse },
})
const publicRosterPreviewRoute = createBookingsPublicRoute({
  method: "post",
  path: "/{bookingId}/amendments/traveler-roster/preview",
  request: adminRosterPreviewRoute.request,
  responses: { ...adminRosterPreviewRoute.responses, 403: publicForbiddenResponse },
})
const publicListRoute = createBookingsPublicRoute({
  method: "get",
  path: "/{bookingId}/amendments",
  request: adminListRoute.request,
  responses: { ...adminListRoute.responses, 403: publicForbiddenResponse },
})
const publicGetRoute = createBookingsPublicRoute({
  method: "get",
  path: "/{bookingId}/amendments/{amendmentId}",
  request: adminGetRoute.request,
  responses: { ...adminGetRoute.responses, 403: publicForbiddenResponse },
})
const publicAcceptRoute = createBookingsPublicRoute({
  method: "post",
  path: "/{bookingId}/amendments/{amendmentId}/accept",
  request: adminAcceptRoute.request,
  responses: { ...adminAcceptRoute.responses, 403: publicForbiddenResponse },
})
const publicApplyRoute = createBookingsPublicRoute({
  method: "post",
  path: "/{bookingId}/amendments/{amendmentId}/apply",
  request: adminApplyRoute.request,
  responses: { ...adminApplyRoute.responses, 403: publicForbiddenResponse },
})
const publicReconcileRoute = createBookingsPublicRoute({
  method: "post",
  path: "/{bookingId}/amendments/{amendmentId}/reconcile",
  request: adminReconcileRoute.request,
  responses: { ...adminReconcileRoute.responses, 403: publicForbiddenResponse },
})

const publicApp = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
publicApp.use(
  "/:bookingId/amendments/traveler-corrections/preview",
  idempotencyKey<Env["Bindings"], Env["Variables"]>({ required: true }),
)
publicApp.use(
  "/:bookingId/amendments/traveler-roster/preview",
  idempotencyKey<Env["Bindings"], Env["Variables"]>({ required: true }),
)
publicApp.use(
  "/:bookingId/amendments/:amendmentId/accept",
  idempotencyKey<Env["Bindings"], Env["Variables"]>({ required: true }),
)
publicApp.use(
  "/:bookingId/amendments/:amendmentId/apply",
  idempotencyKey<Env["Bindings"], Env["Variables"]>({ required: true }),
)
publicApp.use(
  "/:bookingId/amendments/:amendmentId/reconcile",
  idempotencyKey<Env["Bindings"], Env["Variables"]>({ required: true }),
)

export const bookingAmendmentPublicRoutes = publicApp
  .openapi(publicPreviewRoute, async (c) => {
    const bookingId = c.req.valid("param").bookingId
    const denied = await requirePublicAccess(c, bookingId, "amendment:preview")
    if (denied) return denied
    const result = await bookingAmendmentService.previewTravelerCorrection(
      c.get("db"),
      bookingId,
      c.req.valid("json"),
      mutationContext(c, "customer"),
      amendmentDependencies(c),
    )
    if (result.status === "ok") {
      return c.json(
        {
          data: {
            ...result,
            amendment: await auditedPublicAmendment(c, result.amendment, {
              amendmentId: result.amendment.id,
              operation: "preview",
            }),
          },
        },
        201,
      )
    }
    if (result.status === "no_op") return c.json({ data: result }, 200)
    return amendmentError(c, result)
  })
  .openapi(publicRosterPreviewRoute, async (c) => {
    const bookingId = c.req.valid("param").bookingId
    const denied = await requirePublicAccess(c, bookingId, "amendment:preview")
    if (denied) return denied
    const result = await bookingAmendmentService.previewTravelerRosterChange(
      c.get("db"),
      bookingId,
      c.req.valid("json"),
      mutationContext(c, "customer"),
      amendmentDependencies(c),
    )
    if (result.status === "ok") {
      return c.json(
        {
          data: {
            ...result,
            amendment: await auditedPublicAmendment(c, result.amendment, {
              amendmentId: result.amendment.id,
              operation: "preview_roster_change",
            }),
          },
        },
        201,
      )
    }
    return amendmentError(c, result)
  })
  .openapi(publicListRoute, async (c) => {
    const bookingId = c.req.valid("param").bookingId
    const denied = await requirePublicAccess(c, bookingId, "amendment:read")
    if (denied) return denied
    const rows = await bookingAmendmentService.list(c.get("db"), bookingId)
    await logAmendmentHistoryRead(c, bookingId, true, { rowCount: rows.length })
    return c.json({ data: rows.map(publicAmendmentHistory) }, 200)
  })
  .openapi(publicGetRoute, async (c) => {
    const { bookingId, amendmentId } = c.req.valid("param")
    const denied = await requirePublicAccess(c, bookingId, "amendment:read")
    if (denied) return denied
    const row = await bookingAmendmentService.get(c.get("db"), bookingId, amendmentId)
    if (!row) return c.json({ error: "amendment_not_found" }, 404)
    await logAmendmentHistoryRead(c, bookingId, true, { amendmentId }, row.travelerId)
    return c.json({ data: publicAmendmentHistory(row) }, 200)
  })
  .openapi(publicAcceptRoute, async (c) => {
    const { bookingId, amendmentId } = c.req.valid("param")
    const denied = await requirePublicAccess(c, bookingId, "amendment:accept")
    if (denied) return denied
    const existing = await bookingAmendmentService.get(c.get("db"), bookingId, amendmentId)
    if (!existing) return c.json({ error: "amendment_not_found" }, 404)
    const result = await bookingAmendmentService.accept(
      c.get("db"),
      amendmentId,
      c.req.valid("json").proposedRevisionId,
      mutationContext(c, "customer"),
      amendmentDependencies(c),
    )
    if (result.status === "ok" || result.status === "already_applied") {
      return c.json(
        {
          data: await auditedPublicAmendment(c, result.amendment, {
            amendmentId,
            operation: "accept",
          }),
        },
        200,
      )
    }
    return amendmentError(c, result)
  })
  .openapi(publicApplyRoute, async (c) => {
    const { bookingId, amendmentId } = c.req.valid("param")
    const denied = await requirePublicAccess(c, bookingId, "amendment:apply")
    if (denied) return denied
    const existing = await bookingAmendmentService.get(c.get("db"), bookingId, amendmentId)
    if (!existing) return c.json({ error: "amendment_not_found" }, 404)
    const result = await bookingAmendmentService.apply(
      c.get("db"),
      amendmentId,
      c.req.valid("json"),
      mutationContext(c, "customer"),
      amendmentDependencies(c),
    )
    if (result.status === "ok") {
      const amendment = await auditedPublicAmendment(c, result.amendment, {
        amendmentId,
        operation: "apply",
      })
      return c.json({ data: { status: "ok" as const, amendment } }, 200)
    }
    if (result.status === "supplier_refused") {
      const amendment = await auditedPublicAmendment(c, result.amendment, {
        amendmentId,
        operation: "apply",
      })
      return c.json({ data: { status: "supplier_refused" as const, amendment } }, 409)
    }
    if (
      result.status === "supplier_pending" ||
      result.status === "supplier_in_doubt" ||
      result.status === "manual_review"
    ) {
      const amendment = await auditedPublicAmendment(c, result.amendment, {
        amendmentId,
        operation: "apply",
      })
      return c.json({ data: { status: result.status, amendment } }, 202)
    }
    return amendmentError(c, result)
  })
  .openapi(publicReconcileRoute, async (c) => {
    const { bookingId, amendmentId } = c.req.valid("param")
    const denied = await requirePublicAccess(c, bookingId, "amendment:apply")
    if (denied) return denied
    const result = await bookingAmendmentService.reconcile(
      c.get("db"),
      bookingId,
      amendmentId,
      mutationContext(c, "customer"),
      amendmentDependencies(c),
    )
    if (result.status === "ok") {
      const amendment = await auditedPublicAmendment(c, result.amendment, {
        amendmentId,
        operation: "reconcile",
      })
      return c.json({ data: { status: "ok" as const, amendment } }, 200)
    }
    if (result.status === "supplier_refused") {
      const amendment = await auditedPublicAmendment(c, result.amendment, {
        amendmentId,
        operation: "reconcile",
      })
      return c.json({ data: { status: "supplier_refused" as const, amendment } }, 409)
    }
    if (
      result.status === "supplier_pending" ||
      result.status === "supplier_in_doubt" ||
      result.status === "manual_review"
    ) {
      const amendment = await auditedPublicAmendment(c, result.amendment, {
        amendmentId,
        operation: "reconcile",
      })
      return c.json({ data: { status: result.status, amendment } }, 202)
    }
    return amendmentError(c, result)
  })
