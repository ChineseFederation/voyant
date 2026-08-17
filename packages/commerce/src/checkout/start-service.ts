// agent-quality: file-size exception -- owner: commerce; the checkout-start
// service (card / bank-transfer collection intents) is one cohesive
// entry point; splitting it would scatter a single request lifecycle.
import {
  bookingsService,
  getBookingOriginByBookingId,
  listBookingPassThroughItems,
} from "@voyant-travel/bookings"
import { bookingActivityLog, bookingItems, bookings } from "@voyant-travel/bookings/schema"
import { loadCommittedAncillarySelections } from "@voyant-travel/catalog/booking-engine"
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
import {
  AncillaryApplicationExpiredError,
  AncillaryPreparationError,
  AncillaryTermsChangedError,
  prepareBookingAncillaries,
} from "./ancillary-commit.js"
import type { AncillaryOfferSource } from "./ancillary-ports.js"
import type { CheckoutStartOptions } from "./options.js"
import { ANCILLARY_OFFER_SOURCES_RUNTIME_KEY } from "./runtime-ports.js"

export const checkoutStartSchema = z.object({
  bookingId: z.string().min(1),
  paymentIntent: z.enum(["card", "bank_transfer"]),
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
  publicChannel?: {
    channelId: string
    channelStatus?: string | null
  } | null
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
  const publicChannel = requireActivePublicApiChannel(context)
  const db = context.db
  let booking: typeof bookings.$inferSelect | null =
    (await db.select().from(bookings).where(eq(bookings.id, body.bookingId)).limit(1))[0] ?? null
  if (!booking) throw new CatalogCheckoutStartError("booking_not_found", 404)
  if (!["confirmed", "in_progress", "completed"].includes(booking.status)) {
    throw new CatalogCheckoutStartError("booking_not_committed", 409)
  }

  const bookingOrigin = await getBookingOriginByBookingId(db, booking.id)
  if (!bookingOrigin?.channelId || bookingOrigin.channelId !== publicChannel.channelId) {
    throw new CatalogCheckoutStartError("booking_channel_mismatch", 409)
  }
  await ensureBookingPublishedForCheckout(context, booking.id, publicChannel)

  // Pre-create a Legal-owned contract draft carrying the acceptance fingerprint
  // in `metadata.acceptance`. The auto-generate-contract subscriber
  // detects this draft from the already committed Booking
  // by booking_id, populates the rendered body + variables from the
  // confirmed booking state, selects the default customer series, allocates
  // the contract number, and generates the numbered PDF while the contract
  // remains a draft. The payment-completed path then issues, sends, and signs
  // it from `metadata.acceptance`; bank-transfer contracts therefore remain
  // drafts until the transfer is confirmed.
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

  // The post-commit, pre-payment seam for anything quoted live from a third
  // party. It sits here and not in the Booking Session commit because
  // `prepare` is an HTTP call to that third party, and the commit transaction
  // carries the session state machine and the settlement path — a round trip
  // inside it either holds it open across the call or fails it after money has
  // moved (voyant#4733, voyant#4734). Here the Booking exists, nothing has been
  // charged, and the amount the payment provider is about to be asked for is
  // still being assembled.
  const chargedAncillaries = await chargeAcceptedAncillaries(context, booking)
  if (chargedAncillaries > 0) {
    // The premium is a Booking line, so the Booking total has to be re-rolled
    // before anything reads an amount off it. The card path charges
    // `sellAmountCents` and the bank-transfer path bills the item rows; both
    // would otherwise collect a total that omits what the traveller bought.
    await bookingsService.recomputeBookingTotal(db, booking.id)
    booking =
      (await db.select().from(bookings).where(eq(bookings.id, body.bookingId)).limit(1))[0] ??
      booking
  }

  switch (body.paymentIntent) {
    case "card":
      return startCardCheckout(context, booking, body)
    case "bank_transfer":
      return startBankTransferCheckout(context, booking, body)
  }
}

/**
 * Open an application at every source the traveller accepted an offer from,
 * and put each premium on the Booking. Returns how many lines were written.
 *
 * A failure here is a `502`, deliberately. The alternative — dropping the
 * offer and letting checkout continue — charges a traveller who chose travel
 * insurance for a trip without it, and nothing downstream ever says so.
 */
async function chargeAcceptedAncillaries(
  context: CatalogCheckoutStartContext,
  booking: typeof bookings.$inferSelect,
): Promise<number> {
  const sources = resolveAncillaryOfferSources(context)
  if (sources.length === 0) return 0

  const committed = await loadCommittedAncillarySelections(context.db, booking.id)
  if (!committed || committed.accepted.length === 0) return 0

  try {
    const result = await prepareBookingAncillaries({
      db: context.db,
      bookingId: booking.id,
      bookingSessionId: committed.bookingSessionId,
      sources,
      accepted: committed.accepted,
      // The Session's billing step first, the Booking's own contact columns
      // when it left one blank. They are the same fact recorded twice, and a
      // third party that refuses a nameless application would otherwise fail a
      // checkout over which copy was consulted.
      contact: {
        firstName: committed.contact.firstName || (booking.contactFirstName ?? ""),
        lastName: committed.contact.lastName || (booking.contactLastName ?? ""),
        email: committed.contact.email || (booking.contactEmail ?? ""),
        ...(committed.contact.phone || booking.contactPhone
          ? { phone: committed.contact.phone || (booking.contactPhone ?? "") }
          : {}),
      },
      listPassThroughItems: listBookingPassThroughItems,
      ...(context.options.resolveAncillaryTaxTreatmentCode
        ? { resolveTaxTreatmentCode: context.options.resolveAncillaryTaxTreatmentCode }
        : {}),
    })
    // Newly prepared AND already-charged both count. If a previous attempt
    // committed the line and then died before the total was re-rolled, the
    // retry finds the marker, prepares nothing, and would skip the recompute
    // for good — leaving the card path collecting a `sellAmountCents` that
    // omits a premium the invoice still bills.
    return result.prepared.length + result.alreadyCharged.length
  } catch (error) {
    if (error instanceof AncillaryApplicationExpiredError) {
      console.error("[catalog-checkout] ancillary application expired", error)
      throw new CatalogCheckoutStartError("ancillary_application_expired", 409)
    }
    if (error instanceof AncillaryTermsChangedError) {
      console.error("[catalog-checkout] ancillary terms changed", error)
      throw new CatalogCheckoutStartError("ancillary_terms_changed", 409)
    }
    if (error instanceof AncillaryPreparationError) {
      console.error("[catalog-checkout] ancillary preparation failed", error)
      throw new CatalogCheckoutStartError("ancillary_preparation_failed", 502)
    }
    throw error
  }
}

/**
 * The bound sources, or none.
 *
 * Zero is the normal state and stays silent all the way down: a deployment
 * that has connected nothing registers an empty list, and one that has not
 * composed the checkout extension at all resolves to nothing.
 */
function resolveAncillaryOfferSources(
  context: CatalogCheckoutStartContext,
): readonly AncillaryOfferSource[] {
  let resolved: unknown
  try {
    resolved = context.resolveRuntime?.(ANCILLARY_OFFER_SOURCES_RUNTIME_KEY)
  } catch {
    // The container throws for an unregistered key, and a deployment that
    // mounted these routes without the checkout extension's bootstrap has none
    // bound. That is the same silence as binding zero sources.
    return []
  }
  return Array.isArray(resolved) ? (resolved as readonly AncillaryOfferSource[]) : []
}

function requireActivePublicApiChannel(
  context: CatalogCheckoutStartContext,
): NonNullable<CatalogCheckoutStartContext["publicChannel"]> {
  const publicChannel = context.publicChannel
  if (!publicChannel?.channelId || publicChannel.channelStatus !== "active") {
    throw new CatalogCheckoutStartError("active_channel_required", 409)
  }
  return publicChannel
}

async function ensureBookingPublishedForCheckout(
  context: CatalogCheckoutStartContext,
  bookingId: string,
  publicChannel: NonNullable<CatalogCheckoutStartContext["publicChannel"]>,
): Promise<void> {
  const publication = context.options.publication
  if (!publication) {
    throw new CatalogCheckoutStartError("publication_guard_unavailable", 409)
  }

  const rows = await context.db
    .select({ productId: bookingItems.productId })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId))
    .limit(500)
  const productIds = [
    ...new Set(
      rows
        .map((row) => row.productId)
        .filter((productId): productId is string => Boolean(productId)),
    ),
  ]
  if (productIds.length === 0) {
    throw new CatalogCheckoutStartError("product_not_published", 409)
  }

  for (const productId of productIds) {
    const published = await publication.isProductPublished({
      db: context.db,
      bookingId,
      productId,
      channelId: publicChannel.channelId,
    })
    if (!published) {
      throw new CatalogCheckoutStartError("product_not_published", 409)
    }
  }
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

  const session = await financeService.createPaymentSession(db, {
    bookingId: booking.id,
    amountCents,
    currency,
    status: "pending",
    expiresAt: null,
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
    expiresAt: null,
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
