/**
 * The evidence that an accepted ancillary offer is actually charged and issued.
 *
 * voyant#4756: both halves of the seam existed and nothing crossed it — a
 * traveller could accept travel insurance, answer the insurer's questions and
 * acknowledge its disclosures, and then the premium never reached the booking
 * and no policy was ever issued. Every assertion here is on a production entry
 * point (`startCatalogCheckout`, `finalizeCheckout`) rather than on the
 * building blocks, because "the pieces work" was already true when the bug was
 * filed.
 *
 * The route it drives, end to end:
 *
 *   quote → accept  (the accepted selection on the committed Booking Session)
 *   commit          (the `booking_session_commits` row that names the Booking)
 *   checkout-start  (`prepare` at the source, premium onto the Booking)
 *   pay             (the paid `payment_sessions` row)
 *   issue           (`fulfill` at the source, reconciled against the charge)
 *
 * The source is a scripted `AncillaryOfferSource` and not the insurance module,
 * deliberately: that port IS the boundary commerce owns, and commerce may not
 * depend on a module that binds it. What happens on the far side of it — the
 * application row, the issued policy, the certificate on the booking, the
 * `issue_failed` staff alert — is insurance's own integration test.
 */

import {
  bookingActivityLog,
  bookingItems,
  bookingOrigins,
  bookings,
} from "@voyant-travel/bookings/schema"
import {
  bookingSessionCommitsTable,
  bookingSessionsTable,
} from "@voyant-travel/catalog/booking-engine/sessions-schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { invoiceNumberSeries, invoices, paymentSessions } from "@voyant-travel/finance/schema"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type {
  AncillaryFulfillmentResult,
  AncillaryOfferSource,
  AncillaryPreparedSelection,
  AncillaryPrepareInput,
} from "../../src/checkout/ancillary-ports.js"
import { finalizeCheckout } from "../../src/checkout/finalize.js"
import type { CheckoutStartOptions } from "../../src/checkout/options.js"
import { ANCILLARY_OFFER_SOURCES_RUNTIME_KEY } from "../../src/checkout/runtime-ports.js"
import {
  CatalogCheckoutStartError,
  startCatalogCheckout,
} from "../../src/checkout/start-service.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

/** Cleanup truncates the whole operator schema; 5s is not a realistic budget. */
const DB_TEST_TIMEOUT = 60_000

const CHANNEL_ID = "chn_ancillary_storefront"
const PRODUCT_ID = "prod_ancillary_fixture"
const BASE_FARE_MINOR = 120_000
const PREMIUM_MINOR = 4_200

/** Nothing on the bus for this path; a no-op keeps the assertions on the rows. */
const eventBus = {
  emit: async () => undefined,
  subscribe: () => undefined,
} as never

interface ScriptedSource {
  source: AncillaryOfferSource
  prepareCalls: AncillaryPrepareInput[]
  fulfillCalls: string[]
}

/**
 * A source that does exactly what the test tells it to, one call at a time.
 *
 * `prepare` answers with a fixed price so the charge can be asserted against a
 * number the test chose; `fulfill` is scripted per outcome so a refusal, a
 * drift and a success are all reachable from the same shape.
 */
function scriptedSource(options: {
  sourceId?: string
  preparedPriceMinor?: number
  prepareRejects?: Error
  fulfillment?: AncillaryFulfillmentResult
}): ScriptedSource {
  const sourceId = options.sourceId ?? "test-ancillary"
  const prepareCalls: AncillaryPrepareInput[] = []
  const fulfillCalls: string[] = []

  const source: AncillaryOfferSource = {
    sourceId,
    kind: "insurance",
    label: "Travel insurance",
    async quote() {
      return { kind: "insurance", label: "Travel insurance", offers: [], diagnostics: [] }
    },
    async prepare(input): Promise<AncillaryPreparedSelection> {
      prepareCalls.push(input)
      if (options.prepareRejects) throw options.prepareRejects
      return {
        sourceId,
        providerId: input.selection.providerId ?? "test-provider",
        applicationRef: `app_${prepareCalls.length}`,
        priceMinor: options.preparedPriceMinor ?? PREMIUM_MINOR,
        currency: "EUR",
        title: "Comprehensive travel insurance",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }
    },
    async fulfill(input): Promise<AncillaryFulfillmentResult> {
      fulfillCalls.push(input.applicationRef)
      return (
        options.fulfillment ?? {
          status: "fulfilled",
          reference: "POL-1",
          settledPriceMinor: input.chargedPriceMinor,
          currency: input.currency,
          documentIds: ["bdoc_certificate_1"],
        }
      )
    },
    async cancel() {
      // Nothing here unwinds; the tests assert on the forward path only.
    },
  }

  return { source, prepareCalls, fulfillCalls }
}

function acceptedSelection(overrides: Record<string, unknown> = {}) {
  return {
    kind: "insurance",
    decision: "accepted",
    offerId: "offer-1",
    sourceId: "test-ancillary",
    providerId: "test-provider",
    quoteRef: "quote-ref-1",
    travelers: [
      {
        ref: "traveler-0",
        fields: { given_name: "Ana", family_name: "Popescu", date_of_birth: "1990-04-02" },
      },
    ],
    selectedOptionIds: [],
    acceptedDisclosures: [{ kind: "ipid", versionId: "v1", acceptedAt: new Date().toISOString() }],
    ...overrides,
  }
}

function declinedSelection() {
  return {
    kind: "insurance",
    decision: "declined",
    travelers: [],
    selectedOptionIds: [],
    acceptedDisclosures: [],
  }
}

function checkoutOptions(): CheckoutStartOptions {
  return {
    resolveBookingTaxSettings: async () =>
      ({ taxPriceMode: "inclusive", taxPolicyProfileId: null }) as never,
    getOwnedProductName: async () => "Fixture product",
    resolveBankTransferInstructions: async () => ({
      beneficiary: "Voyant SRL",
      iban: "RO49AAAA1B31007593840000",
      bankName: "Test Bank",
    }),
    publication: { isProductPublished: async () => true },
    resolveAncillaryTaxTreatmentCode: () => "insurance/exempt",
  }
}

describe.skipIf(!DB_AVAILABLE)("ancillary checkout charge and fulfilment", () => {
  let db: PostgresJsDatabase
  let sequence = 0

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  }, DB_TEST_TIMEOUT)

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  /**
   * A Booking as the Booking Session commit leaves it: confirmed, on a
   * storefront channel, with the Session that produced it still holding the
   * traveller's ancillary decision.
   */
  async function seedCommittedBooking(ancillaries: unknown[]): Promise<{
    bookingId: string
    bookingSessionId: string
  }> {
    sequence += 1
    const [booking] = await db
      .insert(bookings)
      .values({
        status: "confirmed",
        bookingNumber: `BKG-ANC-${sequence}-${Math.floor(Math.random() * 1_000_000)}`,
        sellCurrency: "EUR",
        sellAmountCents: BASE_FARE_MINOR,
        startDate: "2026-09-01",
      })
      .returning()
    const bookingId = booking!.id

    await db.insert(bookingItems).values({
      bookingId,
      title: "Fixture product",
      itemType: "unit",
      status: "confirmed",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: BASE_FARE_MINOR,
      totalSellAmountCents: BASE_FARE_MINOR,
      productId: PRODUCT_ID,
    })

    await db.insert(bookingOrigins).values({
      bookingId,
      originSource: "direct_b2c",
      channelId: CHANNEL_ID,
    })

    const bookingSessionId = newId("booking_sessions")
    await db.insert(bookingSessionsTable).values({
      id: bookingSessionId,
      createIdempotencyKey: `create-${bookingSessionId}`,
      createRequestFingerprint: "fingerprint",
      actorKind: "customer",
      ownerPrincipalId: "usr_fixture",
      channelId: CHANNEL_ID,
      locale: "en",
      market: "RO",
      currency: "EUR",
      targetKind: "product",
      productId: PRODUCT_ID,
      state: "consumed",
      revision: 2,
      statePayload: {
        billing: {
          buyerType: "B2C",
          contact: {
            firstName: "Ana",
            lastName: "Popescu",
            email: "ana@example.com",
            phone: "+40700000000",
          },
          address: {},
        },
        ancillaries,
      },
      expiresAt: new Date(Date.now() + 3_600_000),
      consumedAt: new Date(),
    })

    await db.insert(bookingSessionCommitsTable).values({
      id: newId("booking_session_commits"),
      sessionId: bookingSessionId,
      idempotencyKey: `commit-${bookingSessionId}`,
      requestFingerprint: "fingerprint",
      outcome: { kind: "committed" },
      bookingId,
    })

    return { bookingId, bookingSessionId }
  }

  async function startCheckout(bookingId: string, source: AncillaryOfferSource) {
    return startCatalogCheckout(
      {
        db,
        env: {},
        eventBus,
        resolveRuntime: (key) =>
          key === ANCILLARY_OFFER_SOURCES_RUNTIME_KEY ? [source] : undefined,
        publicChannel: { channelId: CHANNEL_ID, channelStatus: "active" },
        options: checkoutOptions(),
      },
      { bookingId, paymentIntent: "card", payerEmail: "ana@example.com", payerName: "Ana Popescu" },
    )
  }

  /** Money in: the storefront's paid session, as the provider callback leaves it. */
  async function markPaid(bookingId: string, paymentSessionId: string): Promise<void> {
    await db
      .update(paymentSessions)
      .set({ status: "paid", completedAt: new Date(), providerPaymentId: "pi_test" })
      .where(eq(paymentSessions.id, paymentSessionId))
    await db.insert(invoiceNumberSeries).values({
      code: `INV-${sequence}`,
      name: "Invoices",
      scope: "invoice",
      prefix: "INV",
      separator: "-",
      padLength: 4,
      isDefault: true,
      active: true,
    })
    void bookingId
  }

  async function activityEvents(bookingId: string): Promise<string[]> {
    const rows = await db
      .select({ metadata: bookingActivityLog.metadata })
      .from(bookingActivityLog)
      .where(eq(bookingActivityLog.bookingId, bookingId))
    return rows
      .map((row) => (row.metadata as { event?: unknown } | null)?.event)
      .filter((event): event is string => typeof event === "string")
  }

  async function passThroughItems(bookingId: string) {
    return db
      .select()
      .from(bookingItems)
      .where(
        and(
          eq(bookingItems.bookingId, bookingId),
          eq(bookingItems.pricingTreatment, "pass_through"),
        ),
      )
  }

  it(
    "charges an accepted offer at the prepared price and issues it once paid",
    async () => {
      const { bookingId, bookingSessionId } = await seedCommittedBooking([acceptedSelection()])
      const scripted = scriptedSource({})

      const started = await startCheckout(bookingId, scripted.source)

      // The application was opened against the Session the Booking came from,
      // with the billing step's contact and a key derived from the Booking.
      expect(scripted.prepareCalls).toHaveLength(1)
      expect(scripted.prepareCalls[0]).toMatchObject({
        bookingSessionId,
        contact: { firstName: "Ana", lastName: "Popescu", email: "ana@example.com" },
      })
      expect(scripted.prepareCalls[0]?.idempotencyKey).toContain(bookingId)

      // The premium is on the Booking as a pass-through line: sell equals cost,
      // treatment stamped on the row, priced at what `prepare` committed to.
      const premiumItems = await passThroughItems(bookingId)
      expect(premiumItems).toHaveLength(1)
      expect(premiumItems[0]).toMatchObject({
        totalSellAmountCents: PREMIUM_MINOR,
        totalCostAmountCents: PREMIUM_MINOR,
        pricingTreatment: "pass_through",
        taxTreatmentCode: "insurance/exempt",
        sourceOfferId: "app_1",
      })

      // And the amount the payment provider is asked for contains it, which is
      // the whole point: a premium the traveller is never charged for is the
      // bug this test exists for.
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId))
      expect(booking?.sellAmountCents).toBe(BASE_FARE_MINOR + PREMIUM_MINOR)
      expect(started.kind).toBe("card_redirect")
      if (started.kind !== "card_redirect") return
      const [session] = await db
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.id, started.paymentSessionId))
      expect(session?.amountCents).toBe(BASE_FARE_MINOR + PREMIUM_MINOR)

      await markPaid(bookingId, started.paymentSessionId)
      await finalizeCheckout({
        db,
        eventBus,
        input: { bookingId, paymentSessionId: started.paymentSessionId, paymentIntent: "card" },
        ancillaryOfferSources: [scripted.source],
      })

      // Issued after the money, against the application that was charged.
      expect(scripted.fulfillCalls).toEqual(["app_1"])

      // The invoice the traveller receives carries the premium too.
      const invoiceRows = await db.select().from(invoices).where(eq(invoices.bookingId, bookingId))
      expect(invoiceRows).toHaveLength(1)
      expect(invoiceRows[0]?.totalCents).toBe(BASE_FARE_MINOR + PREMIUM_MINOR)

      // A matched premium is not noise: no drift and no failure was recorded.
      const events = await activityEvents(bookingId)
      expect(events).not.toContain("ancillary.premium.drift")
      expect(events).not.toContain("ancillary.fulfillment.failed")
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "charges nothing for a declined offer",
    async () => {
      const { bookingId } = await seedCommittedBooking([declinedSelection()])
      const scripted = scriptedSource({})

      const started = await startCheckout(bookingId, scripted.source)

      expect(scripted.prepareCalls).toHaveLength(0)
      expect(await passThroughItems(bookingId)).toHaveLength(0)
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId))
      expect(booking?.sellAmountCents).toBe(BASE_FARE_MINOR)

      if (started.kind !== "card_redirect") throw new Error("expected a card checkout")
      await markPaid(bookingId, started.paymentSessionId)
      await finalizeCheckout({
        db,
        eventBus,
        input: { bookingId, paymentSessionId: started.paymentSessionId, paymentIntent: "card" },
        ancillaryOfferSources: [scripted.source],
      })
      expect(scripted.fulfillCalls).toHaveLength(0)
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "charges an accepted offer once when checkout is re-entered",
    async () => {
      const { bookingId } = await seedCommittedBooking([acceptedSelection()])
      const scripted = scriptedSource({})

      await startCheckout(bookingId, scripted.source)
      await startCheckout(bookingId, scripted.source)

      // A customer who hits Back and resubmits must not end up with two
      // applications and two premiums on one booking.
      expect(scripted.prepareCalls).toHaveLength(1)
      expect(await passThroughItems(bookingId)).toHaveLength(1)
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId))
      expect(booking?.sellAmountCents).toBe(BASE_FARE_MINOR + PREMIUM_MINOR)
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "refuses to start checkout when the offer cannot be prepared",
    async () => {
      const { bookingId } = await seedCommittedBooking([acceptedSelection()])
      const scripted = scriptedSource({ prepareRejects: new Error("insurer unreachable") })

      // Before the money, so the honest outcome is to stop. Continuing would
      // charge a traveller who chose insurance for a trip without it.
      await expect(startCheckout(bookingId, scripted.source)).rejects.toBeInstanceOf(
        CatalogCheckoutStartError,
      )
      expect(await passThroughItems(bookingId)).toHaveLength(0)
      const [session] = await db
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.bookingId, bookingId))
      expect(session).toBeUndefined()
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "records a failed issue after payment instead of losing it",
    async () => {
      const { bookingId } = await seedCommittedBooking([acceptedSelection()])
      const scripted = scriptedSource({
        fulfillment: {
          status: "failed",
          code: "provider_declined",
          message: "The insurer refused the risk.",
          retryable: false,
        },
      })

      const started = await startCheckout(bookingId, scripted.source)
      if (started.kind !== "card_redirect") throw new Error("expected a card checkout")
      await markPaid(bookingId, started.paymentSessionId)

      // The saga completes. A failure after a captured payment is a recorded
      // outcome, not a thrown error that unwinds the payment linkage above it.
      await expect(
        finalizeCheckout({
          db,
          eventBus,
          input: { bookingId, paymentSessionId: started.paymentSessionId, paymentIntent: "card" },
          ancillaryOfferSources: [scripted.source],
        }),
      ).resolves.toBeUndefined()

      expect(await activityEvents(bookingId)).toContain("ancillary.fulfillment.failed")
      // The booking stays intact and still carries what was charged, so an
      // operator has something to act on.
      expect(await passThroughItems(bookingId)).toHaveLength(1)
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "records drift between the charged premium and the issued one",
    async () => {
      const { bookingId } = await seedCommittedBooking([acceptedSelection()])
      const scripted = scriptedSource({
        fulfillment: {
          status: "fulfilled",
          reference: "POL-2",
          settledPriceMinor: PREMIUM_MINOR + 100,
          currency: "EUR",
          documentIds: ["bdoc_certificate_2"],
        },
      })

      const started = await startCheckout(bookingId, scripted.source)
      if (started.kind !== "card_redirect") throw new Error("expected a card checkout")
      await markPaid(bookingId, started.paymentSessionId)

      await finalizeCheckout({
        db,
        eventBus,
        input: { bookingId, paymentSessionId: started.paymentSessionId, paymentIntent: "card" },
        ancillaryOfferSources: [scripted.source],
      })

      // Recorded where an operator will see it, and never absorbed by silently
      // adjusting what the traveller already paid.
      const rows = await db
        .select({ metadata: bookingActivityLog.metadata })
        .from(bookingActivityLog)
        .where(eq(bookingActivityLog.bookingId, bookingId))
      const drift = rows
        .map((row) => row.metadata as Record<string, unknown> | null)
        .find((metadata) => metadata?.event === "ancillary.premium.drift")
      expect(drift).toMatchObject({
        chargedPriceMinor: PREMIUM_MINOR,
        settledPriceMinor: PREMIUM_MINOR + 100,
        differenceMinor: 100,
      })
      const premiumItems = await passThroughItems(bookingId)
      expect(premiumItems[0]?.totalSellAmountCents).toBe(PREMIUM_MINOR)
    },
    DB_TEST_TIMEOUT,
  )
})
