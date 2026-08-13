/**
 * Public payment-link + checkout-status routes — owned by
 * `@voyant-travel/storefront`.
 *
 * agent-quality: file-size exception -- the public payment-link surface
 * (config, retry, resolve, start-card, trip/booking summary, checkout-status)
 * is one cohesive route family backed by the finance payment-session record;
 * splitting it would scatter a single checkout contract.
 *
 *   GET  /v1/public/payment-link-config
 *   POST /v1/public/payment-link/:sessionId/retry
 *   GET  /v1/public/payment-link/resolve
 *   POST /v1/public/payment-link/:sessionId/start-card
 *   GET  /v1/public/payment-link/:sessionId/trip-summary
 *   GET  /v1/public/payment-link/:sessionId/booking-summary
 *   GET  /v1/public/bookings/:bookingId/checkout-status
 *
 * The routes are mounted at their ABSOLUTE public paths so the deployment can
 * lazy-mount them via `lazyRoutes.paths`. All cross-module access that
 * storefront does not already depend on (inventory product media, trip
 * envelopes/components reconciliation, the card-payment provider, and the
 * operator settings + checkout base URL) is INJECTED via `options` — the
 * package never statically imports inventory / trips / the netopia plugin /
 * the operator settings module.
 *
 * Storefront already depends acyclically on `@voyant-travel/bookings` and
 * `@voyant-travel/finance`, so the booking / invoice / payment-session reads
 * use those schemas directly.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
import type { EventBus } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import {
  applyPaymentAdapterCallbackEvent,
  buildPaymentLinkUrl,
  financeService,
  refreshPaymentAdapterStatus,
} from "@voyant-travel/finance"
import { invoices, paymentSessions } from "@voyant-travel/finance/schema"
import { paymentCheckoutSchema } from "@voyant-travel/finance/validation"
import {
  openApiValidationHook,
  parseJsonBody,
  parseQuery,
  stampOpenApiRegistryApiId,
} from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import {
  acceptedPaymentCheckoutHandoffs,
  isEmbeddedPaymentCheckout,
  type PaymentAdapter,
  type PaymentCallbackRequest,
  type PaymentCheckoutHandoff,
  type PaymentHostedCheckout,
  paymentAdapterRuntimePort,
} from "@voyant-travel/payments"
import { and, asc, desc, eq, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { storefrontPaymentLinkRuntimePort } from "../runtime-port.js"

const PUBLIC_PAYMENT_LINK_CONFIG_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600"
const paymentCallbackQuerySchema = z.object({
  connectionId: z.string().min(1).optional(),
  "connection-id": z.string().min(1).optional(),
})

/** Absolute path matchers for the deployment's lazy route composition. */
export const PAYMENT_LINK_ROUTE_PATHS = [
  "/v1/public/payment-link-config",
  "/v1/public/payment-link/:sessionId/retry",
  "/v1/public/payment-link/resolve",
  "/v1/public/payment-link/:sessionId/start-card",
  "/v1/public/payment-link/:sessionId/trip-summary",
  "/v1/public/payment-link/:sessionId/booking-summary",
  "/v1/public/bookings/:bookingId/checkout-status",
  "/v1/public/payment-link/callback",
] as const

// ─────────────────────────────────────────────────────────────────
// Injected deployment surface (structural — no inventory / trips /
// netopia / operator-settings static import)
// ─────────────────────────────────────────────────────────────────

/** Resolved bank-transfer beneficiary details from operator settings + env. */
export interface PaymentLinkBankTransferDetails {
  beneficiary: string
  iban: string
  bankName?: string | null
}

/** A resolved trip component, with optional product enrichment. */
export interface PaymentLinkTripComponent {
  id: string
  kind: string
  entityModule: string | null
  entityId: string | null
  description: string | null
  status: string | null
  sequence: number | null
  componentTotalAmountCents: number | null
  componentCurrency: string | null
  metadata: Record<string, unknown> | null
}

/** A resolved trip envelope + its visible components and product enrichment. */
export interface PaymentLinkTripData {
  envelope: { id: string; status: string | null }
  /**
   * Visible (non-removed, non-cancelled) components, already ordered by
   * sequence then createdAt.
   */
  components: PaymentLinkTripComponent[]
  /** product id → display name (from the inventory product record). */
  productNameById: Map<string, string>
  /** product id → cover image (from inventory product media). */
  mediaByProductId: Map<string, { url: string; altText: string | null }>
}

/** The payment-session record fields the handlers read across routes. */
export interface PaymentLinkSessionInput {
  invoiceId: string | null
  amountCents: number
  currency: string
}

export interface PaymentLinkCardPaymentBilling {
  email: string
  phone?: string
  firstName: string
  lastName?: string
  city?: string
  country?: number | string
  state?: string
  postalCode?: string
  details?: string
}

export interface PaymentLinkStartCardPaymentInput {
  id: string
  payerName: string | null
  payerEmail: string | null
  notes: string | null
  redirectUrl: string | null
  billing?: PaymentLinkCardPaymentBilling
  description?: string
  returnUrl?: string
  cancelUrl?: string
  shipping?: Record<string, unknown>
  /**
   * The handoffs the requesting page can render, most preferred first. Comes
   * from the request body: only the page knows whether it has an in-page form
   * to mount. Absent means redirect-only.
   */
  acceptedCheckoutHandoffs?: readonly PaymentCheckoutHandoff[]
}

/**
 * Deployment-supplied access the payment-link handlers need. Everything here
 * encapsulates a module storefront does not statically depend on, so the
 * package stays free of inventory / trips / netopia / operator-settings
 * imports.
 */
export interface PaymentLinkRoutesOptions {
  /**
   * Resolve the bank-transfer beneficiary details (operator settings merged
   * with deploy-wide env defaults), or `null` when not configured.
   */
  resolveBankTransferDetails(c: Context): Promise<PaymentLinkBankTransferDetails | null>
  /** Resolve the public checkout base URL from the deployment bindings. */
  resolvePublicCheckoutBaseUrl(c: Context): string | null
  /**
   * Whether a card processor is wired for this deployment — the card
   * counterpart of `resolveBankTransferDetails`, published on
   * `payment-link-config` so the landing page knows whether to offer card.
   *
   * Static, because adapter selection happens once at graph composition. It
   * says nothing about whether a given start will succeed; `startCardPayment`
   * still answers `{ configured: false }` at the point of use.
   *
   * Omitted means "assume yes", which is how every deployment behaved before
   * the flag existed.
   */
  cardPaymentsConfigured?: boolean
  /**
   * Best-effort: ensure a fresh payment session can be started on the card
   * provider, returning the handoff it chose. `redirectUrl` is the redirect
   * arm's projection and stays `null` for an embedded handoff. Returns
   * `{ configured: false }` when no card processor is wired so the handler can
   * 503. May throw — the handler maps the error to a 502.
   */
  startCardPayment(
    c: Context,
    session: PaymentLinkStartCardPaymentInput,
  ): Promise<
    | { configured: true; redirectUrl: string | null; checkout?: PaymentHostedCheckout | null }
    | { configured: false }
  >
  /**
   * Verify an inbound processor IPN/webhook and apply its event (mark the
   * payment session paid → complete the booking). Absent when no payment
   * adapter is wired. Fails closed: an unverified callback is rejected.
   */
  verifyAndApplyPaymentCallback?(
    c: Context,
    request: PaymentCallbackRequest,
  ): Promise<{ ok: true } | { ok: false; reason: string }>
  /**
   * Best-effort reconciliation for a booking-scoped card session. Managed
   * deployments use the deployment-authenticated status RPC; the adapter and
   * Finance own canonical provider correlation, leasing, and idempotent
   * completion.
   */
  refreshPaymentSessionStatus?(c: Context, paymentSessionId: string): Promise<unknown>
  /**
   * Resolve a trip envelope (+ reconcile a paid checkout) and its visible
   * components with product-media enrichment, or `null` when the envelope is
   * gone. Encapsulates the trips + inventory schema reads.
   */
  resolveTripData(
    c: Context,
    tripEnvelopeId: string,
    session: {
      id: string
      status: string | null
      amountCents: number
      currency: string
      provider: string | null
    },
  ): Promise<PaymentLinkTripData | null>
}

// ─────────────────────────────────────────────────────────────────
// Wire schemas (voyant#2114). These public checkout projections have no
// first-class schema elsewhere, so they are authored here from the exact
// shapes the handlers serialize.
// ─────────────────────────────────────────────────────────────────

const errorResponseSchema = z.object({ error: z.string() })

const bankTransferDetailsSchema = z.object({
  beneficiary: z.string(),
  iban: z.string(),
  bankName: z.string().nullish(),
})

const paymentLinkConfigSchema = z.object({
  publicCheckoutBaseUrl: z.string().nullable(),
  bankTransfer: bankTransferDetailsSchema.nullable(),
  /**
   * Whether this deployment can take a card at all. The landing page needs
   * this before it renders a method: an unstarted payment-link session has
   * no provider and no redirect URL, so the session record alone cannot tell
   * a card deployment from a bank-transfer-only one (voyant#4599).
   */
  cardPayments: z.object({ available: z.boolean() }),
})

const tripComponentSchema = z.object({
  id: z.string(),
  kind: z.string(),
  entityModule: z.string().nullable(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  thumbnailAlt: z.string().nullable(),
  scheduledStartsAt: z.string().nullable(),
  scheduledEndsAt: z.string().nullable(),
  sourceAmountCents: z.number().nullable(),
  sourceCurrency: z.string(),
  targetAmountCents: z.number().nullable(),
  targetCurrency: z.string(),
  fx: z.object({ rate: z.number(), quotedAt: z.string() }).nullable(),
})

const tripSummarySchema = z.object({
  envelopeId: z.string(),
  currency: z.string(),
  totalAmountCents: z.number(),
  components: z.array(tripComponentSchema),
})

const bookingSummaryItemSchema = z.object({
  id: z.string(),
  productName: z.string(),
  optionName: z.string().nullable(),
  unitName: z.string().nullable(),
  departureLabel: z.string().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  serviceDate: z.string().nullable(),
  quantity: z.number(),
  itemType: z.string(),
  amountCents: z.number().nullable(),
  currency: z.string(),
})

const bookingSummarySchema = z.object({
  bookingId: z.string(),
  bookingNumber: z.string(),
  status: z.string(),
  pax: z.number().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  chargeAmountCents: z.number(),
  currency: z.string(),
  bookingTotalAmountCents: z.number().nullable(),
  bookingCurrency: z.string(),
  items: z.array(bookingSummaryItemSchema),
})

const bankTransferInstructionsSchema = z.object({
  beneficiary: z.string(),
  iban: z.string(),
  bankName: z.string(),
  reference: z.string(),
  amountCents: z.number(),
  currency: z.string(),
  dueAt: z.string().nullable(),
  proformaNumber: z.string().nullable(),
})

const checkoutStatusSessionSchema = z.object({
  id: z.string(),
  status: z.string(),
  amountCents: z.number(),
  currency: z.string(),
  invoiceId: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  completedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

const checkoutStatusSchema = z.object({
  bookingId: z.string(),
  bookingNumber: z.string(),
  bookingStatus: z.string(),
  paymentStatus: z.enum(["paid", "failed", "pending"]),
  session: checkoutStatusSessionSchema.nullable(),
  bankTransferInstructions: bankTransferInstructionsSchema.nullable(),
  updatedAt: z.string().nullable(),
})

const sessionParamsSchema = z.object({ sessionId: z.string() })

const cardPaymentBillingSchema = z
  .object({
    email: z.string().min(1),
    phone: z.string().min(1).optional(),
    firstName: z.string().min(1),
    lastName: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    country: z.union([z.number(), z.string().min(1)]).optional(),
    state: z.string().min(1).optional(),
    postalCode: z.string().min(1).optional(),
    details: z.string().min(1).optional(),
  })
  .strict()

const startCardPaymentBodySchema = z
  .object({
    billing: cardPaymentBillingSchema.optional(),
    description: z.string().min(1).optional(),
    shipping: z.record(z.string(), z.unknown()).optional(),
    /**
     * What the calling page can render. A page that omits this gets a redirect,
     * which is what every client built before in-page checkout existed does.
     */
    acceptedCheckoutHandoffs: z
      .array(z.enum(["redirect", "embedded"]))
      .min(1)
      .optional(),
  })
  .strict()

type StartCardPaymentBody = z.infer<typeof startCardPaymentBodySchema>

const startCardPaymentResponseSessionSchema = z.object({
  id: z.string(),
  status: z.string(),
  amountCents: z.number(),
  currency: z.string(),
  redirectUrl: z.string().nullable(),
  checkout: paymentCheckoutSchema.nullable(),
})

const paymentLinkConfigRoute = createRoute({
  method: "get",
  path: "/v1/public/payment-link-config",
  responses: {
    200: {
      description: "Public payment-link configuration (checkout base URL + bank-transfer details)",
      content: { "application/json": { schema: z.object({ data: paymentLinkConfigSchema }) } },
    },
  },
})

const retryPaymentLinkRoute = createRoute({
  method: "post",
  path: "/v1/public/payment-link/{sessionId}/retry",
  request: { params: sessionParamsSchema },
  responses: {
    200: {
      description: "A fresh (or already-paid) payment session for the link",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({ sessionId: z.string(), alreadyPaid: z.boolean().optional() }),
          }),
        },
      },
    },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    500: {
      description: "Failed to create a fresh payment session",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const resolvePaymentLinkRoute = createRoute({
  method: "get",
  path: "/v1/public/payment-link/resolve",
  request: { query: z.object({ ref: z.string().optional() }) },
  responses: {
    200: {
      description: "The payment-session id matched by reference",
      content: {
        "application/json": { schema: z.object({ data: z.object({ sessionId: z.string() }) }) },
      },
    },
    400: {
      description: "Missing ref query param",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Payment session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const startCardPaymentLinkRoute = createRoute({
  method: "post",
  path: "/v1/public/payment-link/{sessionId}/start-card",
  request: { params: sessionParamsSchema },
  responses: {
    200: {
      description: "The card-provider handoff for the session",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              redirectUrl: z.string().nullable(),
              checkout: paymentCheckoutSchema.nullable(),
              session: startCardPaymentResponseSessionSchema.optional(),
            }),
          }),
        },
      },
    },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    502: {
      description: "Card processor failed to start the payment",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    503: {
      description: "Card processor not configured",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const tripSummaryRoute = createRoute({
  method: "get",
  path: "/v1/public/payment-link/{sessionId}/trip-summary",
  request: { params: sessionParamsSchema },
  responses: {
    200: {
      description: "Trip summary for a trip-issued payment session (null for non-trip sessions)",
      content: { "application/json": { schema: z.object({ data: tripSummarySchema.nullable() }) } },
    },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const bookingSummaryRoute = createRoute({
  method: "get",
  path: "/v1/public/payment-link/{sessionId}/booking-summary",
  request: { params: sessionParamsSchema },
  responses: {
    200: {
      description: "Booking summary for a booking-attached payment session (null otherwise)",
      content: {
        "application/json": { schema: z.object({ data: bookingSummarySchema.nullable() }) },
      },
    },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const checkoutStatusRoute = createRoute({
  method: "get",
  path: "/v1/public/bookings/{bookingId}/checkout-status",
  request: {
    params: z.object({ bookingId: z.string() }),
    query: z.object({
      session: z.string().optional(),
      orderId: z.string().optional(),
      ref: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "The booking's checkout/payment status with its latest session",
      content: { "application/json": { schema: z.object({ data: checkoutStatusSchema }) } },
    },
    404: {
      description: "Booking not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

// ─────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────

function cachePublicPaymentLinkConfig(c: Context) {
  c.header("Cache-Control", PUBLIC_PAYMENT_LINK_CONFIG_CACHE_CONTROL)
}

function getDb(c: Context): PostgresJsDatabase {
  return c.get("db") as PostgresJsDatabase
}

function toIsoString(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : value
}

const CARD_PAYMENT_STARTABLE_STATUSES = new Set(["pending"])
const CARD_PAYMENT_CONTINUATION_STATUSES = new Set([
  "requires_redirect",
  "processing",
  "authorized",
  "paid",
])
const CARD_PAYMENT_RETRY_CREATES_SESSION_STATUSES = new Set(["failed", "cancelled", "expired"])

function canStartCardPayment(status: string): boolean {
  return CARD_PAYMENT_STARTABLE_STATUSES.has(status)
}

function canReuseCardHandoff(status: string): boolean {
  return CARD_PAYMENT_CONTINUATION_STATUSES.has(status)
}

/**
 * Finance's payment errors carry a `code` (`payment_processor_identity_mismatch`
 * and friends). Read it structurally rather than importing the error class:
 * the code is the useful half of the log line, and anything thrown from an
 * adapter or the transport still gets its own if it has one.
 */
function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === "string" ? code : undefined
}

/**
 * A stored handoff the caller can still act on.
 *
 * An embedded handoff is only reusable by a page that says it can mount one;
 * handing it to a redirect-only caller would strand them on a session with
 * nowhere to go, so that caller falls through and starts fresh.
 */
export function reusableStoredHandoff(
  session: { status: string; redirectUrl: string | null; checkout: PaymentHostedCheckout | null },
  accepted: readonly PaymentCheckoutHandoff[],
): { redirectUrl: string | null; checkout: PaymentHostedCheckout | null } | null {
  if (!canReuseCardHandoff(session.status)) return null
  const stored = session.checkout
  if (stored && isEmbeddedPaymentCheckout(stored)) {
    return accepted.includes("embedded") ? { redirectUrl: null, checkout: stored } : null
  }
  if (session.redirectUrl) return { redirectUrl: session.redirectUrl, checkout: stored ?? null }
  return null
}

function canUseCardContinuation(status: string): boolean {
  return CARD_PAYMENT_CONTINUATION_STATUSES.has(status)
}

function hasJsonRequestBody(c: Context): boolean {
  const contentLength = c.req.header("content-length")
  if (contentLength && Number(contentLength) > 0) return true
  return c.req.header("content-type")?.toLowerCase().includes("application/json") ?? false
}

async function readStartCardPaymentBody(c: Context): Promise<StartCardPaymentBody> {
  if (!hasJsonRequestBody(c)) return {}
  return parseJsonBody(c, startCardPaymentBodySchema)
}

function publicStartCardSession(session: {
  id: string
  status: string
  amountCents: number
  currency: string
  redirectUrl: string | null
  checkout: PaymentHostedCheckout | null
}) {
  return {
    id: session.id,
    status: session.status,
    amountCents: session.amountCents,
    currency: session.currency,
    redirectUrl: session.redirectUrl,
    // Always emit the key: the response schema declares it nullable, not
    // optional, so an absent handoff is `null` rather than a missing field.
    checkout: session.checkout ?? null,
  }
}

async function buildPublicBankTransferInstructions(
  c: Context,
  options: PaymentLinkRoutesOptions,
  bookingNumber: string,
  session: PaymentLinkSessionInput,
) {
  const db = getDb(c)
  const details = await options.resolveBankTransferDetails(c)
  if (!details) return null

  const [invoice] = session.invoiceId
    ? await db
        .select({
          invoiceNumber: invoices.invoiceNumber,
          dueDate: invoices.dueDate,
          balanceDueCents: invoices.balanceDueCents,
          currency: invoices.currency,
        })
        .from(invoices)
        .where(eq(invoices.id, session.invoiceId))
        .limit(1)
    : []

  return {
    beneficiary: details.beneficiary,
    iban: details.iban,
    bankName: details.bankName ?? "-",
    reference: `BOOK-${bookingNumber}`,
    amountCents: invoice?.balanceDueCents ?? session.amountCents,
    currency: invoice?.currency ?? session.currency,
    dueAt: invoice?.dueDate ?? null,
    proformaNumber: invoice?.invoiceNumber ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────

/**
 * Build the public payment-link routes. Paths are ABSOLUTE so the deployment
 * can lazy-mount the returned app directly via `lazyRoutes.paths`.
 */
export function createPaymentLinkRoutes(options: PaymentLinkRoutesOptions): OpenAPIHono {
  const sessionActionRoutes = new OpenAPIHono({ defaultHook: openApiValidationHook })
    .openapi(paymentLinkConfigRoute, async (c) => {
      const bankTransfer = await options.resolveBankTransferDetails(c)
      cachePublicPaymentLinkConfig(c)
      return c.json(
        {
          data: {
            publicCheckoutBaseUrl: options.resolvePublicCheckoutBaseUrl(c),
            bankTransfer,
            cardPayments: { available: options.cardPaymentsConfigured !== false },
          },
        },
        200,
      )
    })
    .openapi(retryPaymentLinkRoute, async (c) => {
      const { sessionId } = c.req.valid("param")
      const db = getDb(c)
      const [original] = await db
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.id, sessionId))
        .limit(1)
      if (!original) return c.json({ error: "Session not found" }, 404)
      if (!CARD_PAYMENT_RETRY_CREATES_SESSION_STATUSES.has(original.status)) {
        return c.json(
          {
            data: {
              sessionId: original.id,
              alreadyPaid: original.status === "paid",
            },
          },
          200,
        )
      }
      const dbCast = db as Parameters<typeof financeService.createPaymentSession>[0]
      const fresh = await financeService.createPaymentSession(dbCast, {
        targetType: original.targetType,
        targetId: original.targetId ?? undefined,
        bookingId: original.bookingId ?? undefined,
        invoiceId: original.invoiceId ?? undefined,
        bookingPaymentScheduleId: original.bookingPaymentScheduleId ?? undefined,
        bookingGuaranteeId: original.bookingGuaranteeId ?? undefined,
        currency: original.currency,
        amountCents: original.amountCents,
        status: "pending",
        paymentMethod: original.paymentMethod ?? undefined,
        payerEmail: original.payerEmail ?? undefined,
        payerName: original.payerName ?? undefined,
        returnUrl: original.returnUrl ?? undefined,
        cancelUrl: original.cancelUrl ?? undefined,
        notes: original.notes ?? undefined,
      })
      if (!fresh) return c.json({ error: "Failed to create payment session" }, 500)
      return c.json({ data: { sessionId: fresh.id } }, 200)
    })
    .openapi(resolvePaymentLinkRoute, async (c) => {
      const ref = c.req.valid("query").ref
      if (!ref) return c.json({ error: "ref query param is required" }, 400)
      const db = getDb(c)
      const [session] = await db
        .select({ id: paymentSessions.id })
        .from(paymentSessions)
        .where(
          or(
            eq(paymentSessions.id, ref),
            eq(paymentSessions.clientReference, ref),
            eq(paymentSessions.externalReference, ref),
          ),
        )
        .limit(1)
      if (!session) return c.json({ error: "Payment session not found" }, 404)
      return c.json({ data: { sessionId: session.id } }, 200)
    })
    .openapi(startCardPaymentLinkRoute, async (c) => {
      const { sessionId } = c.req.valid("param")
      const db = getDb(c)
      const [session] = await db
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.id, sessionId))
        .limit(1)
      if (!session) return c.json({ error: "Session not found" }, 404)
      // Read the body before the reuse arms: what the caller can render decides
      // whether a stored handoff is usable at all.
      const body = await readStartCardPaymentBody(c)
      const accepted = acceptedPaymentCheckoutHandoffs({
        acceptedCheckoutHandoffs: body.acceptedCheckoutHandoffs,
      })
      const reusable = reusableStoredHandoff(session, accepted)
      if (reusable) {
        return c.json(
          {
            data: {
              redirectUrl: reusable.redirectUrl,
              checkout: reusable.checkout,
              session: publicStartCardSession(session),
            },
          },
          200,
        )
      }
      if (!canStartCardPayment(session.status)) {
        return c.json(
          {
            data: {
              redirectUrl: canUseCardContinuation(session.status)
                ? (session.redirectUrl ?? session.returnUrl ?? null)
                : null,
              checkout: null,
              session: publicStartCardSession(session),
            },
          },
          200,
        )
      }
      const paymentLinkUrl = buildPaymentLinkUrl(session.id, {
        baseUrl: options.resolvePublicCheckoutBaseUrl(c) ?? new URL(c.req.url).origin,
      })
      const returnUrl = session.returnUrl ?? paymentLinkUrl
      const cancelUrl = session.cancelUrl ?? paymentLinkUrl
      try {
        const started = await options.startCardPayment(c, {
          id: session.id,
          payerName: session.payerName,
          payerEmail: session.payerEmail,
          notes: session.notes,
          redirectUrl: session.redirectUrl,
          billing: body.billing,
          description: body.description,
          returnUrl,
          cancelUrl,
          shipping: body.shipping,
          acceptedCheckoutHandoffs: accepted,
        })
        if (!started.configured) {
          return c.json({ error: "Card processor not configured" }, 503)
        }
        const [refreshedSession] = await db
          .select()
          .from(paymentSessions)
          .where(eq(paymentSessions.id, sessionId))
          .limit(1)
        const responseSession = refreshedSession ?? session
        const checkout = started.checkout ?? null
        const embedded = checkout !== null && isEmbeddedPaymentCheckout(checkout)
        // An embedded handoff is the destination, so there is nothing to send
        // the shopper to. Falling back to the return URL here would bounce a
        // page that was about to mount the form.
        const continuationUrl = embedded
          ? null
          : (started.redirectUrl ??
            (canUseCardContinuation(responseSession.status)
              ? (responseSession.returnUrl ?? returnUrl)
              : null))
        return c.json(
          {
            data: {
              redirectUrl: continuationUrl,
              checkout,
              session: publicStartCardSession(responseSession),
            },
          },
          200,
        )
      } catch (err) {
        // The response stays deliberately opaque — a public endpoint must not
        // relay processor internals to the shopper. But swallowing the error
        // entirely left a 502 with nothing behind it: diagnosing voyant#4599
        // meant tracing platform logs and reading the session row by hand.
        // Log it with the session and the error's own code so the next one
        // explains itself.
        console.error("[storefront] payment-link start-card failed", {
          paymentSessionId: session.id,
          sessionProvider: session.provider,
          code: errorCode(err),
          error: err,
        })
        return c.json({ error: "Card processor failed to start the payment" }, 502)
      }
    })

  const summaryRoutes = new OpenAPIHono({ defaultHook: openApiValidationHook })
    .openapi(tripSummaryRoute, async (c) => {
      const { sessionId } = c.req.valid("param")
      const db = getDb(c)
      const [session] = await db
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.id, sessionId))
        .limit(1)
      if (!session) return c.json({ error: "Session not found" }, 404)

      const metadata = (session.metadata ?? {}) as Record<string, unknown>
      const tripEnvelopeId =
        typeof metadata.tripEnvelopeId === "string" ? metadata.tripEnvelopeId : null
      if (!tripEnvelopeId) return c.json({ data: null }, 200)

      const tripData = await options.resolveTripData(c, tripEnvelopeId, {
        id: session.id,
        status: session.status,
        amountCents: session.amountCents,
        currency: session.currency,
        provider: session.provider,
      })
      if (!tripData) return c.json({ data: null }, 200)

      const {
        envelope,
        components: visibleComponents,
        productNameById,
        mediaByProductId,
      } = tripData

      type Allocation = {
        componentId?: string
        sourceAmountCents?: number
        sourceCurrency?: string
        targetAmountCents?: number
        targetCurrency?: string
        fx?: { rate: number; quotedAt: string } | null
      }
      const allocationsRaw = Array.isArray(metadata.componentAllocations)
        ? (metadata.componentAllocations as Allocation[])
        : []
      const allocationByComponentId = new Map<string, Allocation>()
      for (const allocation of allocationsRaw) {
        if (allocation.componentId) allocationByComponentId.set(allocation.componentId, allocation)
      }

      const trip = {
        envelopeId: envelope.id,
        currency: session.currency,
        totalAmountCents: session.amountCents,
        components: visibleComponents.map((component) => {
          const metadataRecord = (component.metadata ?? {}) as Record<string, unknown>
          const catalogItem = (metadataRecord.catalogItem ?? null) as { name?: string } | null
          const flightDraft = (metadataRecord.flightDraft ?? null) as {
            origin?: string
            destination?: string
          } | null
          const schedule = resolvePublicTripComponentSchedule(metadataRecord)
          const fallbackName =
            catalogItem?.name ??
            (component.entityId ? productNameById.get(component.entityId) : null) ??
            (flightDraft?.origin && flightDraft?.destination
              ? `${flightDraft.origin} -> ${flightDraft.destination}`
              : null) ??
            component.description ??
            component.kind.replaceAll("_", " ")
          const thumbnail = component.entityId
            ? (mediaByProductId.get(component.entityId) ?? null)
            : null
          const catalogThumbnailUrl = publicStringValue(
            readPublicRecord(metadataRecord.catalogItem)?.thumbnailUrl,
          )
          const allocation = allocationByComponentId.get(component.id)
          return {
            id: component.id,
            kind: component.kind,
            entityModule: component.entityModule,
            title: fallbackName,
            thumbnailUrl: thumbnail?.url ?? catalogThumbnailUrl ?? null,
            thumbnailAlt: thumbnail?.altText ?? null,
            scheduledStartsAt: schedule.start,
            scheduledEndsAt: schedule.end,
            sourceAmountCents:
              allocation?.sourceAmountCents ?? component.componentTotalAmountCents ?? null,
            sourceCurrency:
              allocation?.sourceCurrency ?? component.componentCurrency ?? session.currency,
            targetAmountCents:
              allocation?.targetAmountCents ?? component.componentTotalAmountCents ?? null,
            targetCurrency: allocation?.targetCurrency ?? session.currency,
            fx: allocation?.fx ?? null,
          }
        }),
      }
      return c.json({ data: trip }, 200)
    })
    .openapi(bookingSummaryRoute, async (c) => {
      const { sessionId } = c.req.valid("param")
      const db = getDb(c)
      const [session] = await db
        .select({
          id: paymentSessions.id,
          bookingId: paymentSessions.bookingId,
          amountCents: paymentSessions.amountCents,
          currency: paymentSessions.currency,
          metadata: paymentSessions.metadata,
        })
        .from(paymentSessions)
        .where(eq(paymentSessions.id, sessionId))
        .limit(1)
      if (!session) return c.json({ error: "Session not found" }, 404)

      const metadata = (session.metadata ?? {}) as Record<string, unknown>
      if (typeof metadata.tripEnvelopeId === "string" && metadata.tripEnvelopeId.length > 0) {
        return c.json({ data: null }, 200)
      }
      if (!session.bookingId) return c.json({ data: null }, 200)

      const [booking] = await db
        .select({
          id: bookings.id,
          bookingNumber: bookings.bookingNumber,
          status: bookings.status,
          sellCurrency: bookings.sellCurrency,
          sellAmountCents: bookings.sellAmountCents,
          pax: bookings.pax,
          startDate: bookings.startDate,
          endDate: bookings.endDate,
        })
        .from(bookings)
        .where(eq(bookings.id, session.bookingId))
        .limit(1)
      if (!booking) return c.json({ data: null }, 200)

      const items = await db
        .select({
          id: bookingItems.id,
          title: bookingItems.title,
          itemType: bookingItems.itemType,
          quantity: bookingItems.quantity,
          totalSellAmountCents: bookingItems.totalSellAmountCents,
          sellCurrency: bookingItems.sellCurrency,
          startsAt: bookingItems.startsAt,
          endsAt: bookingItems.endsAt,
          serviceDate: bookingItems.serviceDate,
          productNameSnapshot: bookingItems.productNameSnapshot,
          optionNameSnapshot: bookingItems.optionNameSnapshot,
          unitNameSnapshot: bookingItems.unitNameSnapshot,
          departureLabelSnapshot: bookingItems.departureLabelSnapshot,
        })
        .from(bookingItems)
        .where(eq(bookingItems.bookingId, booking.id))
        .orderBy(asc(bookingItems.createdAt))

      return c.json(
        {
          data: {
            bookingId: booking.id,
            bookingNumber: booking.bookingNumber,
            status: booking.status,
            pax: booking.pax,
            startDate: booking.startDate,
            endDate: booking.endDate,
            chargeAmountCents: session.amountCents,
            currency: session.currency ?? booking.sellCurrency,
            bookingTotalAmountCents: booking.sellAmountCents,
            bookingCurrency: booking.sellCurrency,
            items: items.map((item) => ({
              id: item.id,
              productName: item.productNameSnapshot ?? item.title,
              optionName: item.optionNameSnapshot,
              unitName: item.unitNameSnapshot,
              departureLabel: item.departureLabelSnapshot,
              startsAt: item.startsAt instanceof Date ? item.startsAt.toISOString() : item.startsAt,
              endsAt: item.endsAt instanceof Date ? item.endsAt.toISOString() : item.endsAt,
              serviceDate: item.serviceDate,
              quantity: item.quantity,
              itemType: item.itemType,
              amountCents: item.totalSellAmountCents,
              currency: item.sellCurrency,
            })),
          },
        },
        200,
      )
    })
    .openapi(checkoutStatusRoute, async (c) => {
      const { bookingId } = c.req.valid("param")
      const query = c.req.valid("query")
      const ref = query.session ?? query.orderId ?? query.ref ?? null
      const db = getDb(c)

      const [booking] = await db
        .select({
          id: bookings.id,
          bookingNumber: bookings.bookingNumber,
          status: bookings.status,
          updatedAt: bookings.updatedAt,
        })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1)
      if (!booking) return c.json({ error: "Booking not found" }, 404)

      const sessionRefFilter = ref
        ? or(
            eq(paymentSessions.id, ref),
            eq(paymentSessions.clientReference, ref),
            eq(paymentSessions.externalReference, ref),
            eq(paymentSessions.providerSessionId, ref),
            eq(paymentSessions.providerPaymentId, ref),
          )
        : undefined
      const sessionWhere = sessionRefFilter
        ? and(eq(paymentSessions.bookingId, bookingId), sessionRefFilter)
        : eq(paymentSessions.bookingId, bookingId)

      const sessionColumns = {
        id: paymentSessions.id,
        status: paymentSessions.status,
        amountCents: paymentSessions.amountCents,
        currency: paymentSessions.currency,
        invoiceId: paymentSessions.invoiceId,
        paymentMethod: paymentSessions.paymentMethod,
        completedAt: paymentSessions.completedAt,
        failedAt: paymentSessions.failedAt,
        updatedAt: paymentSessions.updatedAt,
      }

      let sessions = await db
        .select(sessionColumns)
        .from(paymentSessions)
        .where(sessionWhere)
        .orderBy(desc(paymentSessions.createdAt))
        .limit(5)

      if (sessions.length === 0 && ref) {
        sessions = await db
          .select(sessionColumns)
          .from(paymentSessions)
          .where(eq(paymentSessions.bookingId, bookingId))
          .orderBy(desc(paymentSessions.createdAt))
          .limit(5)
      }

      const refreshableSession = sessions.find((session) =>
        ["requires_redirect", "processing", "authorized"].includes(session.status),
      )
      if (refreshableSession && options.refreshPaymentSessionStatus) {
        try {
          await options.refreshPaymentSessionStatus(c, refreshableSession.id)
          sessions = await db
            .select(sessionColumns)
            .from(paymentSessions)
            .where(sessionWhere)
            .orderBy(desc(paymentSessions.createdAt))
            .limit(5)
        } catch {
          // Reconciliation is best-effort for this public read. Preserve the
          // last persisted state and never expose control-plane details.
        }
      }

      // Authorization only reserves funds; it is not settlement and must
      // never confirm/release a travel booking before capture succeeds.
      const paidSession = sessions.find((session) => session.status === "paid")
      const latestSession = paidSession ?? sessions[0] ?? null
      const isBankTransferSession =
        latestSession?.paymentMethod === "bank_transfer" || Boolean(latestSession?.invoiceId)
      const bankTransferInstructions =
        isBankTransferSession && latestSession
          ? await buildPublicBankTransferInstructions(
              c,
              options,
              booking.bookingNumber,
              latestSession,
            )
          : null
      const failedStatuses = new Set(["failed", "cancelled", "expired"])
      const paymentStatus: "paid" | "failed" | "pending" = paidSession
        ? "paid"
        : sessions.length > 0 && sessions.every((session) => failedStatuses.has(session.status))
          ? "failed"
          : "pending"

      return c.json(
        {
          data: {
            bookingId: booking.id,
            bookingNumber: booking.bookingNumber,
            bookingStatus: booking.status,
            paymentStatus,
            session: latestSession
              ? {
                  ...latestSession,
                  completedAt: toIsoString(latestSession.completedAt),
                  failedAt: toIsoString(latestSession.failedAt),
                  updatedAt: toIsoString(latestSession.updatedAt),
                }
              : null,
            bankTransferInstructions,
            updatedAt: (latestSession?.updatedAt ?? booking.updatedAt)?.toISOString?.() ?? null,
          },
        },
        200,
      )
    })

  const app = new OpenAPIHono({ defaultHook: openApiValidationHook })
    .route("/", sessionActionRoutes)
    .route("/", summaryRoutes)

  // Public processor IPN/webhook. The processor POSTs the raw signed callback;
  // we verify it through the payment adapter (which brokers to the connected
  // processor's verifyCallback) and apply the event. Fails closed.
  app.post("/v1/public/payment-link/callback", async (c) => {
    if (!options.verifyAndApplyPaymentCallback) {
      return c.json({ ok: false, error: "not_configured" }, 503)
    }
    const rawBody = await c.req.text()
    const headers: Record<string, string> = {}
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value
    })
    const query = parseQuery(c, paymentCallbackQuerySchema)
    const result = await options.verifyAndApplyPaymentCallback(c, {
      headers,
      rawBody,
      receivedAt: new Date().toISOString(),
      // `connectionId` is canonical. Accept the unreleased rollout spelling
      // temporarily so mixed preview builds cannot strand callbacks.
      connectionId: query.connectionId ?? query["connection-id"] ?? undefined,
    })
    // 200 when applied; 400 when rejected (a processor may retry on non-2xx).
    return c.json(result, result.ok ? 200 : 400)
  })

  return app
}

/** Package-owned module descriptor; deployments inject provider and projection adapters. */
export function createPaymentLinkApiModule(options: PaymentLinkRoutesOptions): ApiModule {
  return {
    module: { name: "payment-link" },
    publicPath: "/",
    lazyRoutes: {
      paths: PAYMENT_LINK_ROUTE_PATHS,
      load: async () =>
        stampOpenApiRegistryApiId(
          createPaymentLinkRoutes(options),
          "@voyant-travel/storefront#payment-link.api",
        ),
    },
    anonymous: ["payment-link-config", "payment-link"],
  }
}

export const createPaymentLinkVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort, hasPort }) => {
    const options = await getPort(storefrontPaymentLinkRuntimePort)
    // The payment adapter is optional: absent on deployments without a card
    // processor, present (self-host in-process OR the managed remote adapter)
    // when one is wired. When present, the IPN webhook verifies + applies.
    const adapter = hasPort(paymentAdapterRuntimePort)
      ? await getPort(paymentAdapterRuntimePort)
      : undefined
    return createPaymentLinkApiModule({
      ...options,
      verifyAndApplyPaymentCallback: adapter
        ? createVerifiedPaymentCallbackHandler(adapter)
        : undefined,
      refreshPaymentSessionStatus: adapter ? createPaymentStatusRefreshHandler(adapter) : undefined,
    })
  },
)

export function createPaymentStatusRefreshHandler(
  adapter: PaymentAdapter,
  dependencies: {
    refreshStatus?: typeof refreshPaymentAdapterStatus
  } = {},
): NonNullable<PaymentLinkRoutesOptions["refreshPaymentSessionStatus"]> {
  const refreshStatus = dependencies.refreshStatus ?? refreshPaymentAdapterStatus
  return async (c, paymentSessionId) => {
    const eventBus = c.get("eventBus" as never) as EventBus | undefined
    return refreshStatus(adapter, getDb(c), paymentSessionId, {
      context: {
        env: c.env as Readonly<Record<string, unknown>>,
      },
      runtime: { eventBus },
    })
  }
}

export function createVerifiedPaymentCallbackHandler(
  adapter: PaymentAdapter,
  dependencies: {
    applyEvent?: typeof applyPaymentAdapterCallbackEvent
  } = {},
): NonNullable<PaymentLinkRoutesOptions["verifyAndApplyPaymentCallback"]> {
  const applyEvent = dependencies.applyEvent ?? applyPaymentAdapterCallbackEvent
  return async (c, request) => {
    const verification = await adapter.verifyCallback(
      { env: c.env as Readonly<Record<string, unknown>> },
      request,
    )
    if (!verification.verified) {
      return { ok: false, reason: verification.reason }
    }
    const eventBus = c.get("eventBus" as never) as EventBus | undefined
    await applyEvent(getDb(c), verification.event, { eventBus })
    return { ok: true }
  }
}

// ─────────────────────────────────────────────────────────────────
// Pure schedule resolution helpers
// ─────────────────────────────────────────────────────────────────

function resolvePublicTripComponentSchedule(metadata: Record<string, unknown>): {
  start: string | null
  end: string | null
} {
  const scheduledStart = publicStringValue(metadata.scheduledStartsAt)
  const scheduledEnd = publicStringValue(metadata.scheduledEndsAt)
  if (scheduledStart) return { start: scheduledStart, end: scheduledEnd }

  const flightDraft = readPublicRecord(metadata.flightDraft)
  if (flightDraft) {
    const selectedOffer = readPublicRecord(flightDraft.selectedOffer)
    const itineraries = Array.isArray(selectedOffer?.itineraries) ? selectedOffer.itineraries : []
    const firstItinerary = readPublicRecord(itineraries[0])
    const lastItinerary = readPublicRecord(itineraries[itineraries.length - 1])
    const firstSegments = Array.isArray(firstItinerary?.segments) ? firstItinerary.segments : []
    const lastSegments = Array.isArray(lastItinerary?.segments) ? lastItinerary.segments : []
    const firstSegment = readPublicRecord(firstSegments[0])
    const lastSegment = readPublicRecord(lastSegments[lastSegments.length - 1])
    const departure = readPublicRecord(firstSegment?.departure)
    const arrival = readPublicRecord(lastSegment?.arrival)
    return {
      start: publicStringValue(departure?.at) ?? publicStringValue(flightDraft.departDate),
      end: publicStringValue(arrival?.at) ?? publicStringValue(flightDraft.returnDate),
    }
  }

  const bookingDraft = readPublicRecord(metadata.bookingDraftV1)
  const configure = readPublicRecord(bookingDraft?.configure)
  const dateRange = readPublicRecord(configure?.dateRange)
  const departureDate = publicStringValue(configure?.departureDate)
  const checkIn = publicStringValue(dateRange?.checkIn)
  const checkOut = publicStringValue(dateRange?.checkOut)
  if (departureDate || checkIn) {
    return { start: departureDate ?? checkIn, end: checkOut }
  }

  const cruiseDraft = readPublicRecord(metadata.cruiseDraft)
  const embarkationDate = publicStringValue(cruiseDraft?.embarkationDate)
  if (embarkationDate) return { start: embarkationDate, end: null }

  return { start: null, end: null }
}

function readPublicRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function publicStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
