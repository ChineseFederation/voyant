// agent-quality: file-size exception -- owner: commerce; the checkout-start
// service (card / bank-transfer / inquiry / hold intents) is one cohesive
// entry point; splitting it would scatter a single request lifecycle.
import { bookingsService, canTransitionBooking, transitionBooking } from "@voyant-travel/bookings"
import { bookingActivityLog, bookings } from "@voyant-travel/bookings/schema"
import type { EventBus } from "@voyant-travel/core"
import {
  type CreateInvoiceFromBookingInput,
  computePaymentSchedule,
  financeService,
  InvoiceNumberAllocationError,
  issueInvoiceFromBooking,
  issueProformaFromBooking,
  type PaymentPolicy,
  type PaymentPolicySource,
} from "@voyant-travel/finance"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { z } from "zod"
import type { CheckoutStartOptions } from "./options.js"

export const checkoutStartSchema = z.object({
  bookingId: z.string().min(1),
  paymentIntent: z.enum(["card", "bank_transfer", "hold", "inquiry"]),
  contractAcceptance: z
    .object({
      templateId: z.string().min(1),
      templateSlug: z.string().min(1),
      acceptedTerms: z.literal(true),
      acceptedMarketing: z.boolean(),
      acceptedAt: z.string().datetime(),
      renderedHtml: z.string().min(1),
    })
    .optional(),
  payerEmail: z.string().email().optional(),
  payerName: z.string().optional(),
  returnOrigin: z.string().url().optional(),
})

export type CheckoutStartInput = z.infer<typeof checkoutStartSchema>

export interface CheckoutStartRequestMeta {
  clientIp?: string
  userAgent?: string
}

export interface CatalogCheckoutStartContext {
  db: PostgresJsDatabase
  env: Record<string, string | undefined>
  eventBus?: EventBus
  resolveRuntime?: (key: string) => unknown
  requestMeta?: CheckoutStartRequestMeta
  /** Deployment-supplied injected readers (tax settings, owned product name, bank transfer). */
  options: CheckoutStartOptions
}

export type CatalogCheckoutStartResult =
  | {
      kind: "card_redirect"
      bookingId: string
      paymentSessionId: string
      redirectUrl: string | null
      note?: string
    }
  | {
      kind: "bank_transfer_instructions"
      bookingId: string
      proformaId: string | null
      proformaNumber: string | null
      paymentSessionId: string | null
      instructions: {
        beneficiary: string
        iban: string
        bankName: string
        reference: string
        amountCents: number
        currency: string
        dueAt: string
      }
    }
  | {
      kind: "inquiry_received"
      bookingId: string
      inquiryId: string
      note?: string
    }
  | {
      kind: "hold_placed"
      bookingId: string
    }

export class CatalogCheckoutStartError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 404 | 409 | 422 | 500 | 502,
  ) {
    super(code)
    this.name = "CatalogCheckoutStartError"
  }
}

interface AcceptedPaymentTermsSnapshot {
  kind: "accepted_payment_terms"
  policySource: PaymentPolicySource
  policy: PaymentPolicy
  entries: ReturnType<typeof computePaymentSchedule>
  totalCents: number
  currency: string
  departureDate: string | null
  resolvedAt: string
}

export async function startCatalogCheckout(
  context: CatalogCheckoutStartContext,
  body: CheckoutStartInput,
): Promise<CatalogCheckoutStartResult> {
  const db = context.db
  const booking: typeof bookings.$inferSelect | null =
    (await db.select().from(bookings).where(eq(bookings.id, body.bookingId)).limit(1))[0] ?? null
  if (!booking) throw new CatalogCheckoutStartError("booking_not_found", 404)
  if (
    (body.paymentIntent === "card" || body.paymentIntent === "bank_transfer") &&
    booking.holdExpiresAt &&
    booking.holdExpiresAt <= new Date()
  ) {
    throw new CatalogCheckoutStartError("hold_expired", 409)
  }

  // Pre-create a draft contract carrying the acceptance fingerprint
  // in `metadata.acceptance`. The auto-generate-contract subscriber
  // (fired by `booking.confirmed` after payment) detects this draft
  // by booking_id, populates the rendered body + variables from the
  // confirmed booking state, and issues + generates the PDF —
  // allocating the contract number at issue time. The signature
  // promotion path then reads `metadata.acceptance` straight off
  // the contract row instead of relaying through internal_notes.
  //
  // Idempotency: re-entering /checkout/start (e.g. customer hits
  // Back then resubmits) finds the existing draft and updates its
  // metadata in place — no duplicate contract rows, no duplicate
  // acceptance fingerprints.
  if (body.contractAcceptance) {
    try {
      await context.options.persistAcceptanceDraftContract?.(db, {
        requestMeta: context.requestMeta ?? {},
        booking: {
          id: booking.id,
          bookingNumber: booking.bookingNumber,
          personId: booking.personId ?? null,
          organizationId: booking.organizationId ?? null,
        },
        acceptance: body.contractAcceptance,
      })
    } catch (err) {
      // Acceptance recording is best-effort during checkout-start —
      // the customer still needs to reach payment even if our
      // legal-side pre-create stumbles. Surfacing as a 5xx here
      // would block real bookings on a contract-template mis-config;
      // we log and proceed so payment can land.
      console.error("[catalog-checkout] persistAcceptanceDraftContract failed", err)
    }
  }

  switch (body.paymentIntent) {
    case "card":
      return startCardCheckout(context, booking, body)
    case "bank_transfer":
      return startBankTransferCheckout(context, booking, body)
    case "inquiry":
      return startInquiryCheckout(context, booking)
    case "hold":
      return {
        kind: "hold_placed",
        bookingId: booking.id,
      }
  }
}

/**
 * Inquiry intent — write a quote for the operator to follow
 * up on, then cancel the booking so inventory isn't blocked.
 *
 * The pipeline + stage used can be pinned via env vars
 * (`INQUIRY_PIPELINE_ID` / `INQUIRY_STAGE_ID`); otherwise we pick the
 * first sales pipeline + its first stage. Without any configured
 * pipeline the endpoint falls back to a stub response so the journey
 * keeps working through demos.
 */
async function startInquiryCheckout(
  context: CatalogCheckoutStartContext,
  booking: typeof bookings.$inferSelect,
): Promise<CatalogCheckoutStartResult> {
  const db = context.db
  const env = context.env
  const eventBus = context.eventBus

  let pipelineId = env.INQUIRY_PIPELINE_ID ?? null
  let stageId = env.INQUIRY_STAGE_ID ?? null

  if (!pipelineId || !stageId) {
    const selection = await context.options.checkoutInquiry
      .resolvePipeline(db, { pipelineId, stageId })
      .catch(() => null)
    if (selection) {
      pipelineId = selection.pipelineId
      stageId = selection.stageId
    }
  }

  if (!pipelineId || !stageId) {
    // No quote pipeline configured. Still cancel the booking so the
    // hold doesn't linger, and return a stub inquiry reference.
    await releaseInquiryBooking(db, booking, eventBus)
    return {
      kind: "inquiry_received",
      bookingId: booking.id,
      inquiryId: `inq-${booking.id}`,
      note: "No quote pipeline configured — set INQUIRY_PIPELINE_ID + INQUIRY_STAGE_ID to record a real quote.",
    }
  }

  const quote = await context.options.checkoutInquiry.createInquiry(db, {
    title: `Inquiry — booking ${booking.bookingNumber}`,
    pipelineId,
    stageId,
    personId: booking.personId,
    organizationId: booking.organizationId,
    valueAmountCents: booking.sellAmountCents ?? null,
    valueCurrency: booking.sellCurrency ?? null,
    source: "storefront-inquiry",
    sourceRef: booking.id,
  })

  await releaseInquiryBooking(db, booking, eventBus)

  await eventBus?.emit("inquiry.created", {
    quoteId: quote?.id ?? null,
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    pipelineId,
    stageId,
  })

  return {
    kind: "inquiry_received",
    bookingId: booking.id,
    inquiryId: quote?.id ?? `inq-${booking.id}`,
  }
}

async function releaseInquiryBooking(
  db: PostgresJsDatabase,
  booking: typeof bookings.$inferSelect,
  eventBus: EventBus | undefined,
): Promise<void> {
  // Inquiry mode: don't keep capacity locked. Cancel the booking so
  // the hold drops; the row stays for the audit trail.
  if (!canTransitionBooking(booking.status, "cancelled")) return
  try {
    await bookingsService.cancelBooking(
      db,
      booking.id,
      { reason: "Released — converted to inquiry" } as never,
      undefined,
      { eventBus },
    )
  } catch (err) {
    console.warn("[catalog-checkout] could not release booking on inquiry path", err)
  }
}

/**
 * Move the booking from `on_hold` (or `draft`) into `awaiting_payment`
 * so ops can see in the bookings list which rows are pending money
 * vs. just brokered. The state machine accepts the transition;
 * already-`awaiting_payment` / already-`confirmed` rows are
 * silently no-op'd so re-entries (e.g. user reloads the dialog
 * twice) stay idempotent.
 */
async function markAwaitingPayment(
  db: PostgresJsDatabase,
  booking: typeof bookings.$inferSelect,
): Promise<void> {
  if (!canTransitionBooking(booking.status, "awaiting_payment")) return
  const patch = transitionBooking(booking.status, "awaiting_payment")
  await db
    .update(bookings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(bookings.id, booking.id))
}

async function startCardCheckout(
  context: CatalogCheckoutStartContext,
  booking: typeof bookings.$inferSelect,
  body: CheckoutStartInput,
): Promise<CatalogCheckoutStartResult> {
  const db = context.db

  // Without a card provider configured, fall back to a placeholder
  // redirect — the storefront's confirmation page polls booking status
  // and surfaces "we're still processing" until ops marks payment
  // received manually. Useful for demos without sandbox creds.
  const amountCents = booking.sellAmountCents ?? 0
  const currency = booking.sellCurrency ?? "EUR"

  await markAwaitingPayment(db, booking)

  const session = await financeService.createPaymentSession(db, {
    bookingId: booking.id,
    amountCents,
    currency,
    status: "pending",
    expiresAt: booking.holdExpiresAt?.toISOString() ?? null,
    payerName: body.payerName ?? null,
    payerEmail: body.payerEmail ?? null,
    notes: `Storefront card payment for booking ${booking.bookingNumber}`,
    targetType: "booking",
  } as never)
  if (!session) {
    throw new CatalogCheckoutStartError("could_not_create_payment_session", 500)
  }

  // Derive billing name from the payer name; the deployment-supplied
  // `startCardPayment` fills in any provider-specific placeholder billing
  // (city, country code, postal code, etc).
  const [firstName, ...rest] = (body.payerName ?? "").trim().split(/\s+/)
  const lastName = rest.length > 0 ? rest.join(" ") : "Customer"

  let started: { redirectUrl: string | null } | null = null
  try {
    started =
      (await context.options.startCardPayment?.({
        db,
        sessionId: session.id,
        billing: {
          email: body.payerEmail ?? "tbd@example.com",
          firstName: firstName || "Customer",
          lastName,
        },
        description: `Booking ${booking.bookingNumber}`,
        // The provider redirects the customer back to this URL after 3DS.
        // Land them on the confirmation page in card_pending mode — the
        // provider webhook does the actual booking confirmation in the
        // background; this page just polls until the booking flips to
        // `confirmed`.
        returnUrl: body.returnOrigin
          ? `${body.returnOrigin}/shop/confirmation/${encodeURIComponent(booking.id)}?kind=card_pending`
          : undefined,
      })) ?? null
  } catch (err) {
    console.error("[catalog-checkout] startCardPayment failed", err)
    throw new CatalogCheckoutStartError("payment_provider_failed", 502)
  }

  if (!started) {
    // No card provider configured — surface the booking on the standard
    // confirmation page in `card_pending` mode. The page polls booking
    // status and unlocks contract/invoice download links once the
    // operator marks payment received via the booking detail's
    // pending-payment-sessions panel.
    return {
      kind: "card_redirect",
      bookingId: booking.id,
      paymentSessionId: session.id,
      redirectUrl: `/shop/confirmation/${encodeURIComponent(booking.id)}?kind=card_pending&session=${encodeURIComponent(session.id)}`,
      note: "Card payment adapter not configured — falling back to a confirmation-page poll.",
    }
  }

  return {
    kind: "card_redirect",
    bookingId: booking.id,
    paymentSessionId: session.id,
    redirectUrl: started.redirectUrl,
  }
}

async function startBankTransferCheckout(
  context: CatalogCheckoutStartContext,
  booking: typeof bookings.$inferSelect,
  body: CheckoutStartInput,
): Promise<CatalogCheckoutStartResult> {
  const db = context.db
  await ensureBankTransferInvoicingPrerequisites(context)
  const paymentTerms = await snapshotAcceptedPaymentTerms(context, booking)

  await recordCheckoutActivity(db, booking.id, "Storefront bank-transfer checkout started", {
    kind: "storefront_bank_transfer_checkout_started",
    paymentIntent: "bank_transfer",
    paymentTerms,
  })

  if (body.contractAcceptance) {
    await recordCheckoutActivity(db, booking.id, "Draft storefront terms accepted before payment", {
      kind: "storefront_draft_terms_accepted",
      acceptance: {
        templateId: body.contractAcceptance.templateId,
        templateSlug: body.contractAcceptance.templateSlug,
        acceptedAt: body.contractAcceptance.acceptedAt,
        acceptedMarketing: body.contractAcceptance.acceptedMarketing,
        renderedHtmlLength: body.contractAcceptance.renderedHtml.length,
        clientIp: context.requestMeta?.clientIp ?? "",
        userAgent: context.requestMeta?.userAgent ?? "",
      },
      officialContractNumber: null,
      paymentTerms,
    })
  }

  // Bank transfer is the deferred-payment path: the customer leaves with a
  // document reference and pays against it. Which document is issued here,
  // at order placement, is the operator-configurable invoicing mode:
  //   - `proforma-first` (default): issue a proforma; the fiscal invoice is
  //     minted later, on settlement, by the finance proforma-conversion
  //     subscriber. SmartBill (subscribing to invoice.proforma.issued) syncs
  //     it to its proforma endpoint.
  //   - `direct`: issue the fiscal invoice straight away and collect the
  //     bank transfer against it; no later conversion happens.
  // The mode is read off the same operator tax-settings the checkout
  // already resolves — absent/null → proforma-first, the historical
  // bank-transfer behaviour.
  const taxSettings = await context.options.resolveBookingTaxSettings(db)
  const issueDirectInvoice = taxSettings.invoicingMode === "direct"
  const issueDate = new Date().toISOString().slice(0, 10)
  const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const eventBus = context.eventBus

  const documentInput: CreateInvoiceFromBookingInput = {
    bookingId: booking.id,
    issueDate,
    dueDate,
    invoiceType: issueDirectInvoice ? "invoice" : "proforma",
    notes: null,
  }

  // Pull the booking's items via the shared schema; financeService
  // wants the InvoiceFromBookingData shape (booking + items).
  const { bookingItems } = await import("@voyant-travel/bookings/schema")
  const bookingItemRows = await db
    .select()
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, booking.id))

  const issueDocument = issueDirectInvoice ? issueInvoiceFromBooking : issueProformaFromBooking
  let proforma: Awaited<ReturnType<typeof issueProformaFromBooking>>
  try {
    proforma = await issueDocument(
      db,
      documentInput,
      {
        booking: {
          id: booking.id,
          bookingNumber: booking.bookingNumber,
          personId: booking.personId,
          organizationId: booking.organizationId,
          sellCurrency: booking.sellCurrency,
          baseCurrency: booking.baseCurrency,
          fxRateSetId: null,
          sellAmountCents: booking.sellAmountCents,
          baseSellAmountCents: booking.baseSellAmountCents,
        },
        items: bookingItemRows.map((item) => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          unitSellAmountCents: item.unitSellAmountCents,
          totalSellAmountCents: item.totalSellAmountCents,
        })),
      },
      { eventBus },
    )
  } catch (err) {
    if (err instanceof InvoiceNumberAllocationError) {
      if (!issueDirectInvoice && err.scope === "proforma") {
        throw bankTransferInvoiceSeriesError("proforma")
      }
      if (issueDirectInvoice && err.scope === "invoice") {
        throw bankTransferInvoiceSeriesError("invoice")
      }
    }
    throw err
  }

  await markAwaitingPayment(db, booking)

  // Create a payment session targeting the booking + proforma so the
  // operator can mark it received via the existing
  // POST /v1/admin/finance/payment-sessions/:id/complete endpoint.
  // That endpoint emits payment.completed which fires the
  // checkout-finalize workflow (final invoice, contract auto-gen).
  const paymentSession = await financeService.createPaymentSession(db, {
    bookingId: booking.id,
    invoiceId: proforma?.id ?? null,
    amountCents: booking.sellAmountCents ?? 0,
    currency: booking.sellCurrency ?? "EUR",
    status: "pending",
    paymentMethod: "bank_transfer",
    expiresAt: booking.holdExpiresAt?.toISOString() ?? null,
    notes: `Bank transfer for booking ${booking.bookingNumber} (proforma ${
      proforma?.invoiceNumber ?? "—"
    })`,
    targetType: "booking",
  } as never)

  const bankTransfer = await context.options.resolveBankTransferInstructions(db, context.env)
  await recordCheckoutActivity(
    db,
    booking.id,
    "Proforma/payment instructions issued; awaiting bank transfer",
    {
      kind: "storefront_bank_transfer_awaiting_payment",
      proformaId: proforma?.id ?? null,
      proformaNumber: proforma?.invoiceNumber ?? null,
      paymentSessionId: paymentSession?.id ?? null,
      amountCents: booking.sellAmountCents ?? 0,
      currency: booking.sellCurrency ?? "EUR",
      dueAt: dueDate,
      reference: `BOOK-${booking.bookingNumber}`,
      paymentTerms,
    },
  )
  return {
    kind: "bank_transfer_instructions",
    bookingId: booking.id,
    proformaId: proforma?.id ?? null,
    proformaNumber: proforma?.invoiceNumber ?? null,
    paymentSessionId: paymentSession?.id ?? null,
    instructions: {
      beneficiary: bankTransfer.beneficiary,
      iban: bankTransfer.iban,
      bankName: bankTransfer.bankName,
      reference: `BOOK-${booking.bookingNumber}`,
      amountCents: booking.sellAmountCents ?? 0,
      currency: booking.sellCurrency ?? "EUR",
      dueAt: dueDate,
    },
  }
}

async function snapshotAcceptedPaymentTerms(
  context: CatalogCheckoutStartContext,
  booking: typeof bookings.$inferSelect,
): Promise<AcceptedPaymentTermsSnapshot | null> {
  const resolved = await context.options.resolveAcceptedPaymentPolicy?.({
    db: context.db,
    booking: {
      id: booking.id,
      sellAmountCents: booking.sellAmountCents,
      sellCurrency: booking.sellCurrency,
      startDate: booking.startDate,
      customerPaymentPolicy:
        (booking.customerPaymentPolicy as PaymentPolicy | null | undefined) ?? null,
    },
  })
  if (!resolved) return null

  const resolvedAt = new Date().toISOString()
  const totalCents = booking.sellAmountCents ?? 0
  const currency = booking.sellCurrency ?? "EUR"
  return {
    kind: "accepted_payment_terms",
    policySource: resolved.source,
    policy: resolved.policy,
    entries: computePaymentSchedule(
      {
        totalCents,
        currency,
        departureDate: booking.startDate,
        today: new Date(resolvedAt),
      },
      resolved.policy,
    ),
    totalCents,
    currency,
    departureDate: booking.startDate ?? null,
    resolvedAt,
  }
}

async function recordCheckoutActivity(
  db: PostgresJsDatabase,
  bookingId: string,
  description: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.insert(bookingActivityLog).values({
    bookingId,
    actorId: "system",
    activityType: "system_action",
    description,
    metadata,
  })
}

async function ensureBankTransferInvoicingPrerequisites(
  context: CatalogCheckoutStartContext,
): Promise<void> {
  const db = context.db
  // Direct mode issues the fiscal invoice at placement, so it needs an
  // `invoice` series; proforma-first (default) needs the `proforma` series.
  const settings = await context.options.resolveBookingTaxSettings(db)
  const scope = settings.invoicingMode === "direct" ? "invoice" : "proforma"
  const series = await financeService.resolveDefaultInvoiceNumberSeries(db, scope)
  if (!series) throw bankTransferInvoiceSeriesError(scope)
}

function bankTransferInvoiceSeriesError(scope: "invoice" | "proforma"): CatalogCheckoutStartError {
  return new CatalogCheckoutStartError(
    scope === "invoice"
      ? "bank_transfer_invoice_number_series_missing"
      : "bank_transfer_proforma_number_series_missing",
    422,
  )
}
