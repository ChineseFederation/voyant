/**
 * Admin routes for finance booking-billing resources — mounted by the operator
 * starter under `/v1/admin/finance/...` (staff-actor-gated by the parent app's
 * middleware chain). Covers four resources: booking payment schedules, booking
 * guarantees, booking-item tax lines, and booking-item commissions.
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208 — finance sub-batch 9D). Request schemas reuse the existing
 * `validation.ts` (`@voyant-travel/finance-contracts`) schemas the handlers
 * already parse; response row schemas are authored from the Drizzle
 * `$inferSelect` shapes (§17: `Date`/timestamp + `date` columns serialize to
 * strings over the wire; integer money/sort columns stay numbers). The payment
 * session row schema is reused from `routes-invoice-schemas.ts`.
 *
 * Each resource is its own small `OpenAPIHono` sub-chain composed onto
 * `financeBookingBillingRoutes` via `.route("/")` — keeping per-resource chains
 * small bounds the type-inference cost (one flat 19-leg chain has O(n²)
 * inference cost and OOMs the framework build).
 *
 * Optional bodies: the `payment-session` provisioning routes and the
 * `default-plan` route accept fully-optional JSON bodies (every field has a
 * default or is optional). The original handlers required a body via
 * `parseJsonBody`, so these declare a `required: true` request body and parse
 * via `c.req.valid("json")` — a posted `{}` is accepted, only a missing body is
 * rejected with 400 (mirrors the merged `routes-invoice-core.ts` invoice
 * payment-session route).
 *
 * agent-quality: file-size exception — intentional: a mechanically-repetitive
 * billing bundle over four finance booking-billing resources (19 legs), each
 * with a `createRoute` def + handler co-located per the established admin route
 * pattern. Splitting per resource would fragment the single mounted instance
 * without aiding review. See voyant#2114 / voyant#2208.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { ActionLedgerIdempotencyConflictError } from "@voyant-travel/action-ledger"
import { openApiValidationHook } from "@voyant-travel/hono"

import { resolveBookingPaymentPolicyCascade } from "./payment-schedule/booking-policy-runtime.js"
import { paymentSessionSchema } from "./routes-invoice-schemas.js"
import { getActionLedgerRequestContext, getFinanceRouteRuntime } from "./routes-runtime.js"
import { type Env, notFound } from "./routes-shared.js"
import { financeService, PaymentValidationError } from "./service.js"
import {
  applyDefaultBookingPaymentPlanSchema,
  createPaymentSessionFromGuaranteeSchema,
  createPaymentSessionFromScheduleSchema,
  insertBookingGuaranteeSchema,
  insertBookingItemCommissionSchema,
  insertBookingItemTaxLineSchema,
  insertBookingPaymentScheduleSchema,
  updateBookingGuaranteeSchema,
  updateBookingItemCommissionSchema,
  updateBookingItemTaxLineSchema,
  updateBookingPaymentScheduleSchema,
} from "./validation.js"

const errorResponseSchema = z.object({ error: z.string() })

/** `PaymentValidationError` serializes its message + code + details. */
const paymentValidationErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Conflict (409) payload — covers both the `ActionLedgerIdempotencyConflictError`
 * (carries `existingActionId`) and a status-409 `PaymentValidationError`
 * (carries `code` + `details`).
 */
const conflictErrorSchema = z.object({
  error: z.string(),
  existingActionId: z.string().optional(),
  code: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

const successResponseSchema = z.object({ success: z.boolean() })

/** `date`/timestamp columns serialize to strings (§17). */
const isoString = z.string()

const bookingIdParamSchema = z.object({ bookingId: z.string() })
const bookingItemIdParamSchema = z.object({ bookingItemId: z.string() })

// --- Response row schemas (authored from the Drizzle $inferSelect shapes;
//     §17: `date`/timestamp columns are strings on the wire; integer money /
//     rate / sort columns stay numbers) -------------------------------------

const bookingPaymentScheduleSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingItemId: z.string().nullable(),
  amendmentId: z.string().nullable(),
  scheduleType: z.enum(["deposit", "installment", "balance", "hold", "other"]),
  status: z.enum(["pending", "due", "paid", "waived", "cancelled", "expired"]),
  dueDate: isoString,
  dueTimeZone: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
  notes: z.string().nullable(),
  createdAt: isoString,
  updatedAt: isoString,
})

const bookingGuaranteeSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingPaymentScheduleId: z.string().nullable(),
  bookingItemId: z.string().nullable(),
  guaranteeType: z.enum([
    "deposit",
    "credit_card",
    "preauth",
    "card_on_file",
    "bank_transfer",
    "voucher",
    "agency_letter",
    "other",
  ]),
  status: z.enum(["pending", "active", "released", "failed", "cancelled", "expired"]),
  paymentInstrumentId: z.string().nullable(),
  paymentAuthorizationId: z.string().nullable(),
  currency: z.string().nullable(),
  amountCents: z.number().int().nullable(),
  provider: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  guaranteedAt: isoString.nullable(),
  expiresAt: isoString.nullable(),
  releasedAt: isoString.nullable(),
  notes: z.string().nullable(),
  createdAt: isoString,
  updatedAt: isoString,
})

const bookingItemTaxLineSchema = z.object({
  id: z.string(),
  bookingItemId: z.string(),
  code: z.string().nullable(),
  name: z.string(),
  jurisdiction: z.string().nullable(),
  scope: z.enum(["included", "excluded", "withheld"]),
  currency: z.string(),
  amountCents: z.number().int(),
  rateBasisPoints: z.number().int().nullable(),
  includedInPrice: z.boolean(),
  remittanceParty: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoString,
  updatedAt: isoString,
})

const bookingItemCommissionSchema = z.object({
  id: z.string(),
  bookingItemId: z.string(),
  channelId: z.string().nullable(),
  recipientType: z.enum([
    "channel",
    "affiliate",
    "agency",
    "agent",
    "internal",
    "supplier",
    "other",
  ]),
  commissionModel: z.enum(["percentage", "fixed", "markup", "net"]),
  currency: z.string().nullable(),
  amountCents: z.number().int().nullable(),
  rateBasisPoints: z.number().int().nullable(),
  status: z.enum(["pending", "accrued", "payable", "paid", "void"]),
  payableAt: isoString.nullable(),
  paidAt: isoString.nullable(),
  notes: z.string().nullable(),
  createdAt: isoString,
  updatedAt: isoString,
})

// ===========================================================================
// Booking Payment Schedules
// ===========================================================================

const listBookingPaymentSchedulesRoute = createRoute({
  method: "get",
  path: "/bookings/{bookingId}/payment-schedules",
  request: { params: bookingIdParamSchema },
  responses: {
    200: {
      description: "The booking's payment schedules",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(bookingPaymentScheduleSchema) }),
        },
      },
    },
  },
})

const createBookingPaymentScheduleRoute = createRoute({
  method: "post",
  path: "/bookings/{bookingId}/payment-schedules",
  request: {
    params: bookingIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertBookingPaymentScheduleSchema } },
    },
  },
  responses: {
    201: {
      description: "The created payment schedule",
      content: {
        "application/json": { schema: z.object({ data: bookingPaymentScheduleSchema }) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation, or payment validation failed",
      content: { "application/json": { schema: paymentValidationErrorSchema } },
    },
    404: {
      description: "Booking not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Action-ledger idempotency conflict, or payment validation conflict",
      content: { "application/json": { schema: conflictErrorSchema } },
    },
  },
})

const applyDefaultBookingPaymentPlanRoute = createRoute({
  method: "post",
  path: "/bookings/{bookingId}/payment-schedules/default-plan",
  request: {
    params: bookingIdParamSchema,
    body: {
      required: true,
      description:
        "Default payment-plan options. Every field is optional: a posted `{}` " +
        "applies the operator's configured payment policy (booking → proposal → " +
        "listing → category → supplier → operator default), and stating deposit " +
        "terms overrides that policy for this call only.",
      content: { "application/json": { schema: applyDefaultBookingPaymentPlanSchema } },
    },
  },
  responses: {
    201: {
      description: "The created payment schedules for the applied plan",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(bookingPaymentScheduleSchema) }),
        },
      },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateBookingPaymentScheduleRoute = createRoute({
  method: "patch",
  path: "/bookings/{bookingId}/payment-schedules/{scheduleId}",
  request: {
    params: bookingIdParamSchema.extend({ scheduleId: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: updateBookingPaymentScheduleSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated payment schedule",
      content: {
        "application/json": { schema: z.object({ data: bookingPaymentScheduleSchema }) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation, or payment validation failed",
      content: { "application/json": { schema: paymentValidationErrorSchema } },
    },
    404: {
      description: "Payment schedule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Payment validation conflict",
      content: { "application/json": { schema: conflictErrorSchema } },
    },
  },
})

const createSchedulePaymentSessionRoute = createRoute({
  method: "post",
  path: "/bookings/{bookingId}/payment-schedules/{scheduleId}/payment-session",
  request: {
    params: bookingIdParamSchema.extend({ scheduleId: z.string() }),
    body: {
      required: true,
      description:
        "Payment-session provisioning options. Every field is optional, so a " +
        "posted `{}` provisions a session for the schedule amount.",
      content: { "application/json": { schema: createPaymentSessionFromScheduleSchema } },
    },
  },
  responses: {
    201: {
      description: "The created payment session",
      content: { "application/json": { schema: z.object({ data: paymentSessionSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Payment schedule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Unable to create payment session",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteBookingPaymentScheduleRoute = createRoute({
  method: "delete",
  path: "/bookings/{bookingId}/payment-schedules/{scheduleId}",
  request: { params: bookingIdParamSchema.extend({ scheduleId: z.string() }) },
  responses: {
    200: {
      description: "Payment schedule deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    404: {
      description: "Payment schedule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const bookingPaymentScheduleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listBookingPaymentSchedulesRoute, async (c) =>
    c.json(
      {
        data: await financeService.listBookingPaymentSchedules(
          c.get("db"),
          c.req.valid("param").bookingId,
        ),
      },
      200,
    ),
  )
  .openapi(createBookingPaymentScheduleRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.createBookingPaymentSchedule(
        c.get("db"),
        c.req.valid("param").bookingId,
        c.req.valid("json"),
        {
          eventBus: runtime?.eventBus,
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.booking_payment_schedule.route",
        },
      )
      if (!row) {
        return notFound(c, "Booking not found")
      }
      return c.json({ data: row }, 201)
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        return c.json(
          { error: error.message, code: error.code, details: error.details },
          error.status,
        )
      }
      if (error instanceof ActionLedgerIdempotencyConflictError) {
        return c.json({ error: error.message, existingActionId: error.existingActionId }, 409)
      }
      throw error
    }
  })
  .openapi(applyDefaultBookingPaymentPlanRoute, async (c) => {
    const runtime = getFinanceRouteRuntime(c)
    const rows = await financeService.applyDefaultBookingPaymentPlan(
      c.get("db"),
      c.req.valid("param").bookingId,
      c.req.valid("json"),
      {
        eventBus: runtime?.eventBus,
        // A caller that states no deposit terms gets the operator's configured
        // policy, resolved through the same cascade `booking.confirmed` walks
        // (voyant#4744). No cascade composed means no configured deposit, which
        // the service reads as `noDepositPolicy` — pay in full.
        paymentPolicyCascade: await resolveBookingPaymentPolicyCascade(c.var.container, c.env),
        actionLedgerContext: getActionLedgerRequestContext(c),
        actionLedgerAuthorizationSource: "finance.booking_payment_schedule.default_plan.route",
      },
    )
    if (!rows) {
      return notFound(c, "Booking not found")
    }
    return c.json({ data: rows }, 201)
  })
  .openapi(updateBookingPaymentScheduleRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.updateBookingPaymentSchedule(
        c.get("db"),
        c.req.valid("param").scheduleId,
        c.req.valid("json"),
        {
          eventBus: runtime?.eventBus,
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.booking_payment_schedule.route",
        },
      )
      if (!row) {
        return notFound(c, "Payment schedule not found")
      }
      return c.json({ data: row }, 200)
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        return c.json(
          { error: error.message, code: error.code, details: error.details },
          error.status,
        )
      }
      throw error
    }
  })
  .openapi(createSchedulePaymentSessionRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.createPaymentSessionFromBookingSchedule(
        c.get("db"),
        c.req.valid("param").scheduleId,
        c.req.valid("json"),
        {
          eventBus: runtime?.eventBus,
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.payment_session.route",
        },
      )
      if (!row) {
        return notFound(c, "Payment schedule not found")
      }
      return c.json({ data: row }, 201)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create payment session"
      return c.json({ error: message }, 409)
    }
  })
  .openapi(deleteBookingPaymentScheduleRoute, async (c) => {
    const runtime = getFinanceRouteRuntime(c)
    const row = await financeService.deleteBookingPaymentSchedule(
      c.get("db"),
      c.req.valid("param").scheduleId,
      {
        eventBus: runtime?.eventBus,
        actionLedgerContext: getActionLedgerRequestContext(c),
        actionLedgerAuthorizationSource: "finance.booking_payment_schedule.route",
      },
    )
    if (!row) {
      return notFound(c, "Payment schedule not found")
    }
    return c.json({ success: true }, 200)
  })

// ===========================================================================
// Booking Guarantees
// ===========================================================================

const listBookingGuaranteesRoute = createRoute({
  method: "get",
  path: "/bookings/{bookingId}/guarantees",
  request: { params: bookingIdParamSchema },
  responses: {
    200: {
      description: "The booking's guarantees",
      content: {
        "application/json": { schema: z.object({ data: z.array(bookingGuaranteeSchema) }) },
      },
    },
  },
})

const createBookingGuaranteeRoute = createRoute({
  method: "post",
  path: "/bookings/{bookingId}/guarantees",
  request: {
    params: bookingIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertBookingGuaranteeSchema } },
    },
  },
  responses: {
    201: {
      description: "The created guarantee",
      content: { "application/json": { schema: z.object({ data: bookingGuaranteeSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const createGuaranteePaymentSessionRoute = createRoute({
  method: "post",
  path: "/bookings/{bookingId}/guarantees/{guaranteeId}/payment-session",
  request: {
    params: bookingIdParamSchema.extend({ guaranteeId: z.string() }),
    body: {
      required: true,
      description:
        "Payment-session provisioning options. Every field is optional, so a " +
        "posted `{}` provisions a session for the guarantee amount.",
      content: { "application/json": { schema: createPaymentSessionFromGuaranteeSchema } },
    },
  },
  responses: {
    201: {
      description: "The created payment session",
      content: { "application/json": { schema: z.object({ data: paymentSessionSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking guarantee not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Unable to create payment session",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateBookingGuaranteeRoute = createRoute({
  method: "patch",
  path: "/bookings/{bookingId}/guarantees/{guaranteeId}",
  request: {
    params: bookingIdParamSchema.extend({ guaranteeId: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: updateBookingGuaranteeSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated guarantee",
      content: { "application/json": { schema: z.object({ data: bookingGuaranteeSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking guarantee not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteBookingGuaranteeRoute = createRoute({
  method: "delete",
  path: "/bookings/{bookingId}/guarantees/{guaranteeId}",
  request: { params: bookingIdParamSchema.extend({ guaranteeId: z.string() }) },
  responses: {
    200: {
      description: "Guarantee deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    400: {
      description: "invalid_request: guarantee state does not allow deletion",
      content: { "application/json": { schema: paymentValidationErrorSchema } },
    },
    404: {
      description: "Booking guarantee not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const bookingGuaranteeRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listBookingGuaranteesRoute, async (c) =>
    c.json(
      {
        data: await financeService.listBookingGuarantees(
          c.get("db"),
          c.req.valid("param").bookingId,
        ),
      },
      200,
    ),
  )
  .openapi(createBookingGuaranteeRoute, async (c) => {
    const runtime = getFinanceRouteRuntime(c)
    const row = await financeService.createBookingGuarantee(
      c.get("db"),
      c.req.valid("param").bookingId,
      c.req.valid("json"),
      {
        eventBus: runtime?.eventBus,
        actionLedgerContext: getActionLedgerRequestContext(c),
        actionLedgerAuthorizationSource: "finance.booking_guarantee.route",
      },
    )
    if (!row) {
      return notFound(c, "Booking not found")
    }
    return c.json({ data: row }, 201)
  })
  .openapi(createGuaranteePaymentSessionRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.createPaymentSessionFromBookingGuarantee(
        c.get("db"),
        c.req.valid("param").guaranteeId,
        c.req.valid("json"),
        {
          eventBus: runtime?.eventBus,
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.payment_session.route",
        },
      )
      if (!row) {
        return notFound(c, "Booking guarantee not found")
      }
      return c.json({ data: row }, 201)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create payment session"
      return c.json({ error: message }, 409)
    }
  })
  .openapi(updateBookingGuaranteeRoute, async (c) => {
    const runtime = getFinanceRouteRuntime(c)
    const row = await financeService.updateBookingGuarantee(
      c.get("db"),
      c.req.valid("param").guaranteeId,
      c.req.valid("json"),
      {
        eventBus: runtime?.eventBus,
        actionLedgerContext: getActionLedgerRequestContext(c),
        actionLedgerAuthorizationSource: "finance.booking_guarantee.route",
      },
    )
    if (!row) {
      return notFound(c, "Booking guarantee not found")
    }
    return c.json({ data: row }, 200)
  })
  .openapi(deleteBookingGuaranteeRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.deleteBookingGuarantee(
        c.get("db"),
        c.req.valid("param").guaranteeId,
        {
          eventBus: runtime?.eventBus,
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.booking_guarantee.route",
        },
      )
      if (!row) {
        return notFound(c, "Booking guarantee not found")
      }
      return c.json({ success: true }, 200)
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        return c.json({ error: error.message, code: error.code, details: error.details }, 400)
      }
      throw error
    }
  })

// ===========================================================================
// Booking Item Tax Lines
// ===========================================================================

const listBookingItemTaxLinesRoute = createRoute({
  method: "get",
  path: "/booking-items/{bookingItemId}/tax-lines",
  request: { params: bookingItemIdParamSchema },
  responses: {
    200: {
      description: "The booking item's tax lines",
      content: {
        "application/json": { schema: z.object({ data: z.array(bookingItemTaxLineSchema) }) },
      },
    },
  },
})

const createBookingItemTaxLineRoute = createRoute({
  method: "post",
  path: "/booking-items/{bookingItemId}/tax-lines",
  request: {
    params: bookingItemIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertBookingItemTaxLineSchema } },
    },
  },
  responses: {
    201: {
      description: "The created tax line",
      content: { "application/json": { schema: z.object({ data: bookingItemTaxLineSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking item not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateBookingItemTaxLineRoute = createRoute({
  method: "patch",
  path: "/booking-items/{bookingItemId}/tax-lines/{taxLineId}",
  request: {
    params: bookingItemIdParamSchema.extend({ taxLineId: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: updateBookingItemTaxLineSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated tax line",
      content: { "application/json": { schema: z.object({ data: bookingItemTaxLineSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking item tax line not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteBookingItemTaxLineRoute = createRoute({
  method: "delete",
  path: "/booking-items/{bookingItemId}/tax-lines/{taxLineId}",
  request: { params: bookingItemIdParamSchema.extend({ taxLineId: z.string() }) },
  responses: {
    200: {
      description: "Tax line deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    404: {
      description: "Booking item tax line not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const bookingItemTaxLineRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listBookingItemTaxLinesRoute, async (c) =>
    c.json(
      {
        data: await financeService.listBookingItemTaxLines(
          c.get("db"),
          c.req.valid("param").bookingItemId,
        ),
      },
      200,
    ),
  )
  .openapi(createBookingItemTaxLineRoute, async (c) => {
    const row = await financeService.createBookingItemTaxLine(
      c.get("db"),
      c.req.valid("param").bookingItemId,
      c.req.valid("json"),
    )
    if (!row) {
      return notFound(c, "Booking item not found")
    }
    return c.json({ data: row }, 201)
  })
  .openapi(updateBookingItemTaxLineRoute, async (c) => {
    const row = await financeService.updateBookingItemTaxLine(
      c.get("db"),
      c.req.valid("param").taxLineId,
      c.req.valid("json"),
    )
    if (!row) {
      return notFound(c, "Booking item tax line not found")
    }
    return c.json({ data: row }, 200)
  })
  .openapi(deleteBookingItemTaxLineRoute, async (c) => {
    const row = await financeService.deleteBookingItemTaxLine(
      c.get("db"),
      c.req.valid("param").taxLineId,
    )
    if (!row) {
      return notFound(c, "Booking item tax line not found")
    }
    return c.json({ success: true }, 200)
  })

// ===========================================================================
// Booking Item Commissions
// ===========================================================================

const listBookingItemCommissionsRoute = createRoute({
  method: "get",
  path: "/booking-items/{bookingItemId}/commissions",
  request: { params: bookingItemIdParamSchema },
  responses: {
    200: {
      description: "The booking item's commissions",
      content: {
        "application/json": { schema: z.object({ data: z.array(bookingItemCommissionSchema) }) },
      },
    },
  },
})

const createBookingItemCommissionRoute = createRoute({
  method: "post",
  path: "/booking-items/{bookingItemId}/commissions",
  request: {
    params: bookingItemIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertBookingItemCommissionSchema } },
    },
  },
  responses: {
    201: {
      description: "The created commission",
      content: {
        "application/json": { schema: z.object({ data: bookingItemCommissionSchema }) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: paymentValidationErrorSchema } },
    },
    404: {
      description: "Booking item not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateBookingItemCommissionRoute = createRoute({
  method: "patch",
  path: "/booking-items/{bookingItemId}/commissions/{commissionId}",
  request: {
    params: bookingItemIdParamSchema.extend({ commissionId: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: updateBookingItemCommissionSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated commission",
      content: {
        "application/json": { schema: z.object({ data: bookingItemCommissionSchema }) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: paymentValidationErrorSchema } },
    },
    404: {
      description: "Booking item commission not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteBookingItemCommissionRoute = createRoute({
  method: "delete",
  path: "/booking-items/{bookingItemId}/commissions/{commissionId}",
  request: { params: bookingItemIdParamSchema.extend({ commissionId: z.string() }) },
  responses: {
    200: {
      description: "Commission deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    404: {
      description: "Booking item commission not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const bookingItemCommissionRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listBookingItemCommissionsRoute, async (c) =>
    c.json(
      {
        data: await financeService.listBookingItemCommissions(
          c.get("db"),
          c.req.valid("param").bookingItemId,
        ),
      },
      200,
    ),
  )
  .openapi(createBookingItemCommissionRoute, async (c) => {
    try {
      const row = await financeService.createBookingItemCommission(
        c.get("db"),
        c.req.valid("param").bookingItemId,
        c.req.valid("json"),
      )
      if (!row) {
        return notFound(c, "Booking item not found")
      }
      return c.json({ data: row }, 201)
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        return c.json({ error: error.message, code: error.code, details: error.details }, 400)
      }
      throw error
    }
  })
  .openapi(updateBookingItemCommissionRoute, async (c) => {
    try {
      const row = await financeService.updateBookingItemCommission(
        c.get("db"),
        c.req.valid("param").commissionId,
        c.req.valid("json"),
      )
      if (!row) {
        return notFound(c, "Booking item commission not found")
      }
      return c.json({ data: row }, 200)
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        return c.json({ error: error.message, code: error.code, details: error.details }, 400)
      }
      throw error
    }
  })
  .openapi(deleteBookingItemCommissionRoute, async (c) => {
    const row = await financeService.deleteBookingItemCommission(
      c.get("db"),
      c.req.valid("param").commissionId,
    )
    if (!row) {
      return notFound(c, "Booking item commission not found")
    }
    return c.json({ success: true }, 200)
  })

// Compose the four per-resource sub-chains onto a single OpenAPIHono so the
// `.openapi()` operations propagate up through the parent `financeRoutes`
// registry (OpenAPIHono.route copies the sub-app's registered routes).
export const financeBookingBillingRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .route("/", bookingPaymentScheduleRoutes)
  .route("/", bookingGuaranteeRoutes)
  .route("/", bookingItemTaxLineRoutes)
  .route("/", bookingItemCommissionRoutes)
