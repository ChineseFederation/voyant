/**
 * Booking payment-schedule route module — owned by `@voyant-travel/finance`.
 *
 * Hosts the admin + public payment-policy surface plus the schedule-generation
 * orchestration that backs the `booking.confirmed` subscriber:
 *
 *   POST /v1/admin/bookings/:bookingId/payment-schedule/regenerate
 *   POST /v1/public/payment-policy/resolve
 *
 * The policy cascade (booking → listing → category → supplier → operator
 * default) is deployment-specific — the resolvers read across vertical modules
 * (cruises / accommodations / products / suppliers / categories) that the
 * finance package must not statically import. They are therefore INJECTED via
 * {@link BookingScheduleRoutesOptions}, alongside the operator-default resolver.
 *
 * The bookings schema (`bookings`, `bookingActivityLog`) and the action-ledger
 * appender are imported directly: `@voyant-travel/finance` already depends on
 * both `@voyant-travel/bookings` and `@voyant-travel/action-ledger` acyclically
 * (neither depends back on finance), so no injection is needed there.
 *
 * All handler behavior, cascade precedence, idempotency, and the activity-log
 * entry are preserved byte-for-byte from the operator's previous
 * `booking-schedule.ts`.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import { appendActionLedgerMutation } from "@voyant-travel/action-ledger"
import { bookingActivityLog, bookings } from "@voyant-travel/bookings/schema"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { openApiValidationHook, parseJsonBody } from "@voyant-travel/hono"
import type { ApiExtension } from "@voyant-travel/hono/module"
import { asc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY } from "../booking-schedule/subscriber-runtime.js"
import {
  computePaymentSchedule,
  noDepositPolicy,
  type PaymentPolicy,
  type PaymentPolicySource,
  resolveEffectivePaymentPolicy,
} from "../payment-policy.js"
import type { PaymentPolicyEntityContext } from "../payment-policy-cascade.js"
import { PROFORMA_CONVERSION_SUBSCRIBER_RUNTIME_KEY } from "../proforma-conversion-runtime.js"
import { createFinanceBookingScheduleRuntime } from "../runtime.js"
import {
  financeAccommodationsPaymentPolicyRuntimePort,
  financeCruisesPaymentPolicyRuntimePort,
  financeDistributionPaymentPolicyRuntimePort,
  financeHostRuntimePort,
  financeInventoryPaymentPolicyRuntimePort,
  financeOperatorSettingsRuntimePort,
  financeProposalsPaymentPolicyRuntimePort,
} from "../runtime-port.js"
import { bookingPaymentSchedules } from "../schema/booking-billing.js"
import { financeService } from "../service.js"
import {
  type BookingPaymentPolicyCascadeReaders,
  resolveBookingPaymentPolicy,
} from "./booking-policy.js"

export type { PaymentPolicyEntityContext }

/**
 * Deployment-supplied options for the booking payment-schedule route module.
 *
 * The cascade resolvers + operator default are INJECTED because they read
 * across vertical modules (cruises / accommodations / products / suppliers /
 * product categories) that finance must not statically import. The bookings
 * schema and action-ledger appender are NOT injected — finance already depends
 * on both acyclically and imports them directly.
 *
 * The booking-keyed half is {@link BookingPaymentPolicyCascadeReaders}, shared
 * with every other surface that has to answer what a booking owes.
 */
export interface BookingScheduleRoutesOptions extends BookingPaymentPolicyCascadeReaders {
  /** Resolve the per-request drizzle db from the Hono context (`c.get("db")`). */
  resolveDb(c: Context): PostgresJsDatabase

  // ── Entity-keyed cascade (storefront resolve path) ────────────────────────
  resolveListingPolicyForEntity(
    db: PostgresJsDatabase,
    ctx: PaymentPolicyEntityContext,
  ): Promise<PaymentPolicy | null>
  resolveCategoryPolicyForEntity(
    db: PostgresJsDatabase,
    ctx: PaymentPolicyEntityContext,
  ): Promise<PaymentPolicy | null>
  resolveSupplierPolicyForEntity(
    db: PostgresJsDatabase,
    ctx: PaymentPolicyEntityContext,
  ): Promise<PaymentPolicy | null>

  // ── Policy-source bookkeeping on the booking row ──────────────────────────
  /** Persist the winning cascade source onto the booking's internalNotes. */
  stampPolicySourceOnBooking(
    db: PostgresJsDatabase,
    bookingId: string,
    source: PaymentPolicySource,
  ): Promise<void>
  /** Read the stamped cascade source back off internalNotes (regenerate response). */
  readPolicySourceFromInternalNotes(internalNotes: string): PaymentPolicySource | null
}

/**
 * Generate (or regenerate) the payment schedule for a booking.
 *
 * Resolves the effective customer payment policy (cascade: booking → listing →
 * category → supplier → operator default), runs {@link computePaymentSchedule},
 * persists the rows via `financeService.applyComputedPaymentSchedule`, stamps
 * the cascade source on the booking, and writes a `system_action` activity-log
 * entry.
 *
 * Idempotent: when any schedule row already exists for the booking (in any
 * status) it returns early so a re-fired `booking.confirmed` event doesn't wipe
 * outstanding rows and double-bill the customer on paper.
 */
export async function generatePaymentScheduleForBooking(
  db: PostgresJsDatabase,
  bookingId: string,
  options: BookingScheduleRoutesOptions,
): Promise<void> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
  if (!booking) return
  if (!booking.sellAmountCents || booking.sellAmountCents <= 0) return

  // Idempotency: delivery may replay `booking.confirmed`, and an explicit
  // operator correction can re-emit it so downstream projections converge.
  // If a schedule already exists
  // (in any status — pending/due/paid/etc.), regenerating would wipe
  // the outstanding rows and insert a fresh full-amount plan as if
  // the booking had never been touched, double-billing the customer
  // on paper.
  const [existingSchedule] = await db
    .select({ id: bookingPaymentSchedules.id })
    .from(bookingPaymentSchedules)
    .where(eq(bookingPaymentSchedules.bookingId, bookingId))
    .limit(1)
  if (existingSchedule) return

  const { policy, source } = await resolveBookingPaymentPolicy(db, booking, options)

  const entries = computePaymentSchedule(
    {
      totalCents: booking.sellAmountCents,
      currency: booking.sellCurrency,
      departureDate: booking.startDate,
    },
    policy,
  )

  await financeService.applyComputedPaymentSchedule(db, bookingId, entries, { replace: true })

  // Stash the source on the booking's internalNotes so the contract
  // resolver can echo it via `booking.paymentPolicy.source`. The
  // source enum is small (booking | listing | category | supplier |
  // operator_default) so a single marker line is enough.
  await options.stampPolicySourceOnBooking(db, bookingId, source)

  // Audit trail — record what cascade layer applied, which policy
  // was used, and the resulting schedule snapshot. Lets ops trace
  // why a particular schedule was generated. The structured metadata
  // (`kind: payment_schedule_regenerated`) distinguishes this row
  // from other system-issued activity entries.
  await db.insert(bookingActivityLog).values({
    bookingId,
    actorId: "system",
    activityType: "system_action",
    description: `Payment schedule regenerated from ${source} policy (${entries.length} row${
      entries.length === 1 ? "" : "s"
    })`,
    metadata: {
      kind: "payment_schedule_regenerated",
      policySource: source,
      policy,
      entries,
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Admin route: update booking-level policy + regenerate schedule
// ─────────────────────────────────────────────────────────────────

const depositRuleApiSchema = z.object({
  kind: z.enum(["none", "percent", "fixed_cents"]),
  percent: z.number().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
})

const policyApiSchema = z.object({
  deposit: depositRuleApiSchema,
  minDaysBeforeDepartureForDeposit: z.number().int().min(0),
  balanceDueDaysBeforeDeparture: z.number().int().min(0),
  balanceDueMinDaysFromNow: z.number().int().min(0),
})

const regenerateScheduleBodySchema = z.object({
  /**
   * Optional booking-level override. When provided, persists onto
   * `bookings.customerPaymentPolicy` before running the resolver.
   * Pass `null` to clear an existing override (cascade falls back
   * to listing/category/supplier/operator default).
   */
  customerPaymentPolicy: policyApiSchema.nullable().optional(),
})

// Cascade source the resolver stamps on the response (booking → proposal →
// listing → category → supplier → operator default). Mirrors
// `PaymentPolicySource`.
const paymentPolicySourceSchema = z.enum([
  "booking",
  "proposal",
  "listing",
  "category",
  "supplier",
  "operator_default",
])

const errorResponseSchema = z.object({ error: z.string() })

// Schedule rows are the raw `booking_payment_schedules` Drizzle select rows.
// They have no first-class wire schema (the journey-specific projection lives
// in the public payment-options surface), so the documented envelope keeps the
// `schedule` array permissive while pinning the policy + cascade-source shapes
// the contract test asserts.
const regenerateScheduleResponseSchema = z.object({
  data: z.object({
    schedule: z.array(z.unknown()),
    bookingPolicy: policyApiSchema.nullable(),
    cascadeSource: paymentPolicySourceSchema,
  }),
})

// The optional override body is parsed in-handler (`parseJsonBody`) so a
// missing/empty body stays valid and a malformed override still 400s — the
// route therefore declares only the path param + response envelopes.
const regenerateScheduleRoute = createRoute({
  method: "post",
  path: "/{bookingId}/payment-schedule/regenerate",
  "x-voyant-api-id": "@voyant-travel/finance#booking-schedule-extension.api.admin",
  request: { params: z.object({ bookingId: z.string() }) },
  responses: {
    200: {
      description: "Regenerated payment schedule + resolved booking policy + cascade source",
      content: { "application/json": { schema: regenerateScheduleResponseSchema } },
    },
    400: {
      description: "Missing booking id or invalid payment-policy override body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

async function handleRegenerateSchedule(
  c: Context,
  options: BookingScheduleRoutesOptions,
): Promise<Response> {
  const db = options.resolveDb(c)
  const bookingId = c.req.param("bookingId")
  if (!bookingId) {
    return c.json({ error: "missing_booking_id" }, 400)
  }

  let body: z.infer<typeof regenerateScheduleBodySchema>
  try {
    body = await parseJsonBody(c, regenerateScheduleBodySchema)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "invalid_body" }, 400)
  }

  // Persist the override (or clear it) before running the resolver.
  if (Object.hasOwn(body, "customerPaymentPolicy")) {
    const [before] = await db
      .select({ customerPaymentPolicy: bookings.customerPaymentPolicy })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)

    await db
      .update(bookings)
      .set({
        customerPaymentPolicy: (body.customerPaymentPolicy ?? null) as unknown,
        revision: sql`${bookings.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))

    const overrideChanged =
      JSON.stringify(before?.customerPaymentPolicy ?? null) !==
      JSON.stringify(body.customerPaymentPolicy ?? null)
    if (overrideChanged) {
      await appendActionLedgerMutation(db, {
        context: getPaymentScheduleActionLedgerRequestContext(c),
        actionName: "booking.payment_policy.override",
        actionVersion: "v1",
        actionKind: "update",
        evaluatedRisk: "high",
        targetType: "booking",
        targetId: bookingId,
        routeOrToolName: "bookings.payment-schedule.regenerate",
        authorizationSource: "operator.booking-schedule.route",
        mutationDetail: {
          summary:
            body.customerPaymentPolicy === null
              ? "Cleared booking payment policy override"
              : "Updated booking payment policy override",
          reversalKind: "none",
        },
      })
    }
  }

  await generatePaymentScheduleForBooking(db, bookingId, options)

  const rows = await db
    .select()
    .from(bookingPaymentSchedules)
    .where(eq(bookingPaymentSchedules.bookingId, bookingId))
    .orderBy(asc(bookingPaymentSchedules.dueDate), asc(bookingPaymentSchedules.createdAt))

  const [updatedBooking] = await db
    .select({
      customerPaymentPolicy: bookings.customerPaymentPolicy,
      internalNotes: bookings.internalNotes,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)

  return c.json(
    {
      data: {
        schedule: rows,
        bookingPolicy: updatedBooking?.customerPaymentPolicy ?? null,
        cascadeSource:
          options.readPolicySourceFromInternalNotes(updatedBooking?.internalNotes ?? "") ??
          "operator_default",
      },
    },
    200,
  )
}

function getPaymentScheduleActionLedgerRequestContext(
  c: Context,
): ActionLedgerRequestContextValues {
  return {
    userId: c.get("userId") ?? null,
    agentId: c.get("agentId") ?? null,
    workflowPrincipalId: c.get("workflowPrincipalId") ?? null,
    principalSubtype: c.get("principalSubtype") ?? null,
    sessionId: c.get("sessionId") ?? null,
    apiTokenId: c.get("apiTokenId") ?? c.get("apiKeyId") ?? null,
    callerType: c.get("callerType") ?? null,
    actor: c.get("actor") ?? null,
    isInternalRequest: c.get("isInternalRequest") ?? false,
    organizationId: c.get("organizationId") ?? null,
    workflowRunId: c.get("workflowRunId") ?? null,
    workflowStepId: c.get("workflowStepId") ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────
// Public route: resolve policy for an entity (storefront preview)
// ─────────────────────────────────────────────────────────────────

const resolvePolicyBodySchema = z.object({
  entityModule: z.string(),
  entityId: z.string(),
  /** Cruise journey selections — resolver walks cabin → sailing →
   *  cruise once these are picked. Optional because the customer
   *  may not have selected a cabin yet. */
  sailingId: z.string().optional(),
  cabinCategoryId: z.string().optional(),
  /** Accommodation journey selection — resolver picks the rate plan's
   *  policy when present. */
  ratePlanId: z.string().optional(),
})

const resolvePolicyResponseSchema = z.object({
  data: z.object({
    policy: policyApiSchema,
    source: paymentPolicySourceSchema,
  }),
})

const resolvePolicyRoute = createRoute({
  method: "post",
  path: "/resolve",
  "x-voyant-api-id": "@voyant-travel/finance#booking-schedule-extension.api.public",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: resolvePolicyBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Resolved effective payment policy + cascade source for an entity",
      content: { "application/json": { schema: resolvePolicyResponseSchema } },
    },
  },
})

async function handleResolvePolicy(
  c: Context,
  options: BookingScheduleRoutesOptions,
  body: z.infer<typeof resolvePolicyBodySchema>,
): Promise<Response> {
  const db = options.resolveDb(c)

  const operatorDefault = (await options.resolveOperatorDefaultPaymentPolicy(db)) ?? noDepositPolicy

  // Vertical-specific listing lookups — same source-of-truth queries
  // as the booking-confirmed path, just keyed off the journey
  // selections instead of a persisted booking_items row.
  const listingPolicy = await options.resolveListingPolicyForEntity(db, body)
  const categoryPolicy = await options.resolveCategoryPolicyForEntity(db, body)
  const supplierPolicy = await options.resolveSupplierPolicyForEntity(db, body)

  const { policy, source } = resolveEffectivePaymentPolicy({
    listingPolicy,
    categoryPolicy,
    supplierPolicy,
    operatorDefault,
  })

  return c.json(
    {
      data: {
        policy,
        source,
      },
    },
    200,
  )
}

/**
 * Bridge handlers that return a bare `Response` (the `{ data }` / `{ error }`
 * envelopes the orchestration builds) to the `.openapi()` per-route typed
 * response union. The runtime payloads honor the declared schemas (asserted by
 * the contract tests); this only relaxes the compile-time check.
 */
// biome-ignore lint/suspicious/noExplicitAny: intentional — bridges bare Response to the inferred typed-response union.
function asRouteResponse(response: Promise<Response>): Promise<any> {
  return response
}

/**
 * Admin payment-schedule routes (relative paths; mount at `/v1/admin/bookings`).
 *
 *   POST /:bookingId/payment-schedule/regenerate
 */
export function createBookingScheduleAdminRoutes(options: BookingScheduleRoutesOptions) {
  return new OpenAPIHono({ defaultHook: openApiValidationHook }).openapi(
    regenerateScheduleRoute,
    (c) => asRouteResponse(handleRegenerateSchedule(c, options)),
  )
}

/**
 * Public payment-policy routes (relative paths; mount at
 * `/v1/public/payment-policy`).
 *
 *   POST /resolve  — anonymous storefront preview of the effective policy.
 */
export function createPaymentPolicyPublicRoutes(options: BookingScheduleRoutesOptions) {
  return new OpenAPIHono({ defaultHook: openApiValidationHook }).openapi(resolvePolicyRoute, (c) =>
    asRouteResponse(handleResolvePolicy(c, options, c.req.valid("json"))),
  )
}

/** Package-owned extension descriptor; deployments inject the policy cascade readers. */
export function createBookingScheduleApiExtension(
  options: BookingScheduleRoutesOptions,
): ApiExtension {
  return {
    extension: { name: "booking-schedule", module: "bookings" },
    lazyAdminRoutes: async () => createBookingScheduleAdminRoutes(options),
    lazyPublicRoutes: async () => createPaymentPolicyPublicRoutes(options),
    publicPath: "payment-policy",
    anonymous: true,
  }
}

export const createBookingScheduleVoyantRuntime = defineGraphRuntimeFactory(
  async ({ api, getPort, hasPort }) => {
    const operatorSettings = await getPort(financeOperatorSettingsRuntimePort)
    const provider = createFinanceBookingScheduleRuntime(
      await getPort(financeHostRuntimePort),
      operatorSettings,
      await getPort(financeDistributionPaymentPolicyRuntimePort),
      await getPort(financeAccommodationsPaymentPolicyRuntimePort),
      await getPort(financeCruisesPaymentPolicyRuntimePort),
      await getPort(financeInventoryPaymentPolicyRuntimePort),
      // Optional: a deployment that composes no proposals module has no
      // proposal layer to read, and the cascade is unchanged without it.
      hasPort(financeProposalsPaymentPolicyRuntimePort)
        ? await getPort(financeProposalsPaymentPolicyRuntimePort)
        : null,
    )
    const configured = createBookingScheduleApiExtension(provider.options)
    const selected: ApiExtension = {
      extension: {
        ...configured.extension,
        bootstrap: async ({ container, eventBus }) => {
          container.register(BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY, {
            resolveRoutesOptions: () => provider.options,
            withDb: provider.withDb,
          })
          // Same host wiring powers the proforma-conversion subscriber:
          // when a fully-paid proforma settles it mints the fiscal invoice.
          container.register(PROFORMA_CONVERSION_SUBSCRIBER_RUNTIME_KEY, {
            withDb: provider.withDb,
            eventBus,
          })
        },
      },
    }
    if (api.some(({ surface }) => surface === "admin") && configured.lazyAdminRoutes) {
      selected.lazyAdminRoutes = configured.lazyAdminRoutes
    }
    if (api.some(({ surface }) => surface === "public") && configured.lazyPublicRoutes) {
      selected.lazyPublicRoutes = configured.lazyPublicRoutes
      if (configured.publicPath !== undefined) selected.publicPath = configured.publicPath
      if (configured.anonymous !== undefined) selected.anonymous = configured.anonymous
    }
    return selected
  },
)
