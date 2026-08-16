import {
  assertBookingLifecycleConformanceV1,
  bookingLifecycleConformanceScenariosV1,
} from "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance"
import type { PricingBreakdownV1 } from "@voyant-travel/catalog-contracts/booking-engine/pricing-contracts"
import { isPermanentSubscriberError } from "@voyant-travel/core"
import { describe, expect, it } from "vitest"

import type { BookingRequirementsV1 } from "./contracts.js"
import {
  createInMemoryBookingSessionRepository,
  createInMemoryOwnedInventoryPorts,
  inMemoryBookingRequirements,
} from "./sessions-memory.js"
import {
  type BookingSessionPaymentPorts,
  type CommitCompositeBookingInput,
  type CommitCompositeBookingResult,
  createBookingSessionModule,
} from "./sessions-service.js"

const BASE_PRICING = {
  currency: "EUR",
  lines: [
    { kind: "base" as const, label: "Adult", quantity: 1, unitAmount: 10000, totalAmount: 10000 },
  ],
  taxes: [],
  subtotal: 10000,
  taxTotal: 0,
  total: 10000,
}

const TEST_CAPABILITY = `bcap_${"a".repeat(43)}`
const STOREFRONT_ACCESS = {
  storefront: { storefrontId: "sf_public", channelId: "chan_public" },
} as const
const ANONYMOUS_ACCESS = {
  actorKind: "anonymous" as const,
  capability: TEST_CAPABILITY,
  ...STOREFRONT_ACCESS,
}
let createCounter = 0

function createHarness(
  ttl: {
    sessionTtlMs?: number
    quoteTtlMs?: number
    holdTtlMs?: number
    maxRenewalExtensionMs?: number
    maxSessionLifetimeMs?: number
  } = {},
  payments?: BookingSessionPaymentPorts,
  commitCompositeBooking?: (
    input: CommitCompositeBookingInput,
  ) => Promise<CommitCompositeBookingResult>,
  requirements?: BookingRequirementsV1,
) {
  let currentNow = new Date("2026-08-01T12:00:00.000Z")
  let price = BASE_PRICING
  // Some pricing is not a constant: a policy snapshot is stamped with the
  // instant it was read, so the value differs on every compose of the very
  // same selection. Set this to model that faithfully.
  let pricePerCompose: (() => PricingBreakdownV1) | null = null
  let published = requirements ?? inMemoryBookingRequirements()
  const repository = createInMemoryBookingSessionRepository()
  const inventory = createInMemoryOwnedInventoryPorts()
  inventory.setCapacity("product:prod_owned_1", 1)
  inventory.setCapacity("trip_snapshot:trsn_frozen", 1)
  const module = createBookingSessionModule({
    now: () => currentNow,
    ...(ttl.sessionTtlMs == null ? {} : { sessionTtlMs: ttl.sessionTtlMs }),
    quoteTtlMs: ttl.quoteTtlMs ?? 5 * 60_000,
    holdTtlMs: ttl.holdTtlMs ?? 60_000,
    ...(ttl.maxRenewalExtensionMs == null
      ? {}
      : { maxRenewalExtensionMs: ttl.maxRenewalExtensionMs }),
    ...(ttl.maxSessionLifetimeMs == null ? {} : { maxSessionLifetimeMs: ttl.maxSessionLifetimeMs }),
    ports: {
      repository,
      normalizeSelection: async ({ selection }) => selection,
      composeRequirements: async () => ({ status: "available", requirements: published }),
      composeQuote: async () => ({
        status: "quoted",
        requirements: published,
        pricing: pricePerCompose ? pricePerCompose() : price,
      }),
      placeCapacityHold: inventory.placeCapacityHold,
      releaseCapacityHold: inventory.releaseCapacityHold,
      commitOwnedBooking: inventory.commitOwnedBooking,
      commitCompositeBooking,
      payments,
    },
  })
  return {
    module,
    repository,
    inventory,
    advance(ms: number) {
      currentNow = new Date(currentNow.getTime() + ms)
    },
    setPrice(next: typeof BASE_PRICING) {
      price = next
    },
    setPricePerCompose(next: (() => PricingBreakdownV1) | null) {
      pricePerCompose = next
    },
    setRequirements(next: BookingRequirementsV1) {
      published = next
    },
  }
}

async function createQuoteAndHold(harness = createHarness()) {
  const created = await harness.module.createSession(
    {
      idempotencyKey: nextCreateKey("create_quote_hold"),
      target: { kind: "product", productId: "prod_owned_1" },
    },
    ANONYMOUS_ACCESS,
  )
  if (created.kind !== "session_created") throw new Error("session not created")
  const quoted = await harness.module.quoteSession(
    created.session.id,
    {
      expectedRevision: created.session.revision,
      idempotencyKey: "quote_key",
    },
    ANONYMOUS_ACCESS,
  )
  if (quoted.kind !== "quote_created") throw new Error("quote not created")
  const held = await harness.module.placeHold(
    created.session.id,
    {
      expectedRevision: created.session.revision,
      quoteId: quoted.quote.id,
      idempotencyKey: "hold_key",
    },
    ANONYMOUS_ACCESS,
  )
  if (held.kind !== "hold_created") throw new Error("hold not created")
  return {
    harness,
    session: created.session,
    capability: TEST_CAPABILITY,
    quote: quoted.quote,
    hold: held.hold,
  }
}

/** The same three steps against an aggregate target, whose Commit can stay open. */
async function createCompositeQuoteAndHold(harness = createHarness()) {
  const created = await harness.module.createAcceptedProposalSession(
    {
      idempotencyKey: nextCreateKey("create_composite_quote_hold"),
      proposalId: "prps_accepted",
      proposalVersionId: "prvr_accepted",
      tripSnapshotId: "trsn_frozen",
      tripEnvelopeId: "trip_composed",
    },
    ANONYMOUS_ACCESS,
  )
  if (created.kind !== "session_created") throw new Error("session not created")
  const quoted = await harness.module.quoteSession(
    created.session.id,
    { expectedRevision: created.session.revision, idempotencyKey: "quote_composite_key" },
    ANONYMOUS_ACCESS,
  )
  if (quoted.kind !== "quote_created") throw new Error("quote not created")
  const held = await harness.module.placeHold(
    created.session.id,
    {
      expectedRevision: created.session.revision,
      quoteId: quoted.quote.id,
      idempotencyKey: "hold_composite_key",
    },
    ANONYMOUS_ACCESS,
  )
  if (held.kind !== "hold_created") throw new Error("hold not created")
  return { harness, session: created.session, quote: quoted.quote, hold: held.hold }
}

describe("Booking Session v1 owned tracer", () => {
  it("returns a stable payment_required continuation without creating a Booking", async () => {
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    const input = {
      expectedRevision: session.revision,
      quoteId: quote.id,
      requirementsFingerprint: quote.requirementsFingerprint,
      holdId: hold.id,
      idempotencyKey: "commit_payment_required",
      checkoutIntent: "card" as const,
    }

    const first = await harness.module.commitSession(session.id, input, ANONYMOUS_ACCESS)
    const retry = await harness.module.commitSession(session.id, input, ANONYMOUS_ACCESS)

    expect(first).toMatchObject({
      kind: "commit_result",
      outcome: {
        kind: "payment_required",
        checkoutIntent: "card",
        paymentTarget: "booking_session",
        paymentSession: { id: "payment_session_1", status: "requires_redirect" },
      },
    })
    expect(retry).toEqual(first)
    expect(payment.prepareCalls).toBe(2)
    expect(harness.inventory.bookingIds).toEqual([])
    expect(harness.repository.commits.size).toBe(0)
    expect(harness.repository.sessions.get(session.id)?.state).toBe("active")
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("active")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("active")
  })

  it("rejects an intent the active Quote did not offer before payment or booking side effects", async () => {
    const payment = createPaymentHarness()
    const requirements = { ...inMemoryBookingRequirements(), paymentIntents: ["card" as const] }
    const harness = createHarness({}, payment.ports, undefined, requirements)
    const { session, quote, hold } = await createQuoteAndHold(harness)

    const outcome = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
        requirementsFingerprint: quote.requirementsFingerprint,
        holdId: hold.id,
        idempotencyKey: "commit_unsupported_intent",
        checkoutIntent: "bank_transfer",
      },
      ANONYMOUS_ACCESS,
    )

    expect(outcome).toEqual({
      kind: "rejected",
      error: {
        kind: "checkout_intent_not_offered",
        checkoutIntent: "bank_transfer",
        offeredCheckoutIntents: ["card"],
        nextAction: "select_supported_checkout_intent",
      },
    })
    expect(payment.prepareCalls).toBe(0)
    expect(harness.inventory.bookingIds).toEqual([])
    expect(harness.repository.commits.size).toBe(0)
    expect(harness.repository.sessions.get(session.id)?.state).toBe("active")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("active")
  })

  it("commits bank transfer with durable instructions and conflicts on a changed intent", async () => {
    const payment = createBankTransferHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    const input = {
      expectedRevision: session.revision,
      quoteId: quote.id,
      requirementsFingerprint: quote.requirementsFingerprint,
      holdId: hold.id,
      idempotencyKey: "commit_bank_transfer",
      checkoutIntent: "bank_transfer" as const,
    }

    const first = await harness.module.commitSession(session.id, input, ANONYMOUS_ACCESS)
    const retry = await harness.module.commitSession(session.id, input, ANONYMOUS_ACCESS)
    const conflict = await harness.module.commitSession(
      session.id,
      { ...input, checkoutIntent: "card" },
      ANONYMOUS_ACCESS,
    )

    expect(first).toMatchObject({
      kind: "commit_result",
      outcome: {
        kind: "committed",
        checkoutIntent: "bank_transfer",
        bankTransfer: {
          paymentSessionId: "pays_bank_transfer",
          document: { id: "invc_proforma", number: "PRO-42", type: "proforma" },
          instructions: {
            beneficiary: "Voyant Travel",
            iban: "RO49AAAA1B31007593840000",
            reference: "BOOK-42",
            amountCents: 10_000,
            currency: "EUR",
          },
        },
      },
    })
    expect(retry).toMatchObject({
      kind: "commit_result",
      outcome: {
        kind: "idempotent_replay",
        originalOutcome: {
          kind: "committed",
          checkoutIntent: "bank_transfer",
          bankTransfer: { document: { id: "invc_proforma" } },
        },
      },
    })
    expect(conflict).toEqual({ kind: "rejected", error: { kind: "idempotency_conflict" } })
    expect(payment.prepareCalls).toBe(1)
    expect(payment.establishCalls).toBe(1)
    expect(harness.inventory.bookingIds).toHaveLength(1)
  })

  it("transfers an established Session payment in the atomic Commit transaction", async () => {
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    const input = {
      expectedRevision: session.revision,
      quoteId: quote.id,
      requirementsFingerprint: quote.requirementsFingerprint,
      holdId: hold.id,
      idempotencyKey: "commit_after_payment",
    }

    await harness.module.commitSession(session.id, input, ANONYMOUS_ACCESS)
    payment.established = true
    const committed = await harness.module.commitSession(session.id, input, ANONYMOUS_ACCESS)

    expect(committed).toMatchObject({ kind: "commit_result", outcome: { kind: "committed" } })
    expect(harness.inventory.bookingIds).toHaveLength(1)
    expect(payment.transfers).toEqual([
      expect.objectContaining({
        paymentSessionId: "payment_session_1",
        bookingSessionId: session.id,
        bookingId: harness.inventory.bookingIds[0],
      }),
    ])
  })

  it("refuses to re-quote a Session whose money is with a processor", async () => {
    // voyant#4636, from the live rows: a shopper parked on the "payment is
    // confirming" screen kept quoting — 31 Quotes over 20 minutes, every one
    // superseding the last and releasing the Hold behind it. The seat was given
    // back three seconds before the money landed.
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.inFlight = true

    const frozen = { kind: "payment_in_flight", nextAction: "await_payment_outcome" }
    const revision = () => harness.repository.sessions.get(session.id)!.revision

    // Every door that releases the live Holds, not just the one the incident
    // came through.
    expect(
      await harness.module.quoteSession(
        session.id,
        { expectedRevision: revision(), idempotencyKey: "requote_while_paying" },
        ANONYMOUS_ACCESS,
      ),
    ).toEqual({ kind: "rejected", error: frozen })
    expect(
      await harness.module.renewSession(
        session.id,
        { expectedRevision: revision(), extendBySeconds: 60, idempotencyKey: "renew_while_paying" },
        ANONYMOUS_ACCESS,
      ),
    ).toEqual({ kind: "rejected", error: frozen })
    expect(
      await harness.module.updateSession(
        session.id,
        {
          expectedRevision: revision(),
          selection: { departureSlotId: "slot_later" },
          idempotencyKey: "reselect_while_paying",
        },
        ANONYMOUS_ACCESS,
      ),
    ).toEqual({ kind: "rejected", error: frozen })
    expect(
      await harness.module.placeHold(
        session.id,
        {
          expectedRevision: revision(),
          quoteId: quote.id,
          idempotencyKey: "rehold_while_paying",
        },
        ANONYMOUS_ACCESS,
      ),
    ).toEqual({ kind: "rejected", error: frozen })

    expect(harness.repository.quotes.get(quote.id)?.state).toBe("active")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("active")
  })

  it("settles the Quote the payment was collected for, not the Session's newest", async () => {
    // The second guard, for the Quotes a shopper minted before the payment went
    // in flight. Settlement took "the Session's one active Quote", so it read a
    // Quote nobody had paid for and was refused `quote_failure` on every retry
    // until the outbox gave up: money captured, no Booking.
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.established = { quoteId: quote.id, holdId: hold.id }

    // A Quote the shopper minted before the payment went in flight, which the
    // guard above no longer prevents. Superseded directly rather than by
    // re-quoting, because re-quoting also releases the Hold and this is about
    // which Quote settlement picks.
    harness.repository.quotes.get(quote.id)!.state = "superseded"
    const session_ = harness.repository.sessions.get(session.id)!
    session_.revision += 1

    const settled = await harness.module.commitPaidSession({
      bookingSessionId: session.id,
      paymentSessionId: "payment_session_1",
    })

    expect(harness.inventory.bookingIds).toEqual([settled.bookingId])
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("consumed")
    expect(payment.transfers).toEqual([
      expect.objectContaining({
        paymentSessionId: "payment_session_1",
        bookingSessionId: session.id,
        bookingId: settled.bookingId,
      }),
    ])
  })

  it("gives a final settlement refusal back as permanent, and stops holding the seat", async () => {
    // voyant#4636 forbade releasing the live Holds on the refusal path, because
    // the first failed attempt took away the seat the money was collected for
    // and every retry after it failed for a second, self-inflicted reason. That
    // rule binds while retries remain — and an expired Quote leaves none:
    // nothing a later attempt reads will have changed. So the verdict is
    // declared permanent, which dead-letters on the spot instead of restating
    // the same refusal seven more times, and the seat stops being reserved for
    // a Commit that will not happen (voyant#4692).
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.established = { quoteId: quote.id, holdId: hold.id }
    harness.repository.quotes.get(quote.id)!.state = "expired"

    const refusal = await harness.module
      .commitPaidSession({
        bookingSessionId: session.id,
        paymentSessionId: "payment_session_1",
      })
      .catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(Error)
    expect((refusal as Error).message).toBe(
      "booking_session_settlement_commit_rejected:quote_failure:expired",
    )
    expect(isPermanentSubscriberError(refusal)).toBe(true)
    expect(harness.repository.holds.get(hold.id)?.state).toBe("released")
    expect(harness.inventory.hasActiveHold(hold.id)).toBe(false)
    expect(harness.repository.sessions.get(session.id)?.state).toBe("active")
  })

  it("keeps retrying, and keeps the Hold, while the Commit is still underway", async () => {
    // The other half of the same rule: a component Commit that has not answered
    // yet is not a verdict. Nothing may be released and nothing may be
    // dead-lettered — the retry is the point.
    const payment = createPaymentHarness()
    payment.established = true
    const harness = createHarness({}, payment.ports, async () => ({
      kind: "component_commit_pending",
      nextAction: "continue_component_commit",
      components: [{ componentId: "trcp_manual", state: "manual_confirmation_required" }],
    }))
    const { session, hold } = await createCompositeQuoteAndHold(harness)

    const refusal = await harness.module
      .commitPaidSession({
        bookingSessionId: session.id,
        paymentSessionId: "payment_session_1",
      })
      .catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(Error)
    expect(isPermanentSubscriberError(refusal)).toBe(false)
    expect(harness.repository.holds.get(hold.id)?.state).toBe("active")
  })

  it("settles against the live Hold when the payment recorded only its Quote", async () => {
    // The first defect in voyant#4692, and the reason it read as impossible:
    // the Hold was active, unexpired, correctly sized and bound to the Quote
    // the money was collected for, and settlement refused `hold_failure`
    // anyway — because it never looked at it. `prepare` records the pair from
    // the Commit it was called on and reuses an existing payment row without
    // rewriting its metadata, so a checkout that reached `prepare` before
    // taking its Hold records the Quote alone, permanently.
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.established = { quoteId: quote.id, holdId: null }

    const settled = await harness.module.commitPaidSession({
      bookingSessionId: session.id,
      paymentSessionId: "payment_session_1",
    })

    expect(harness.inventory.bookingIds).toEqual([settled.bookingId])
    expect(harness.repository.holds.get(hold.id)?.state).toBe("converted")
  })

  it("re-takes the capacity when the shopper's client released the Hold behind it", async () => {
    // Reproduced live on voyant#4692: quote, hold, then a re-quote six seconds
    // later that superseded the Quote and released the Hold with it — fifteen
    // minutes before the Hold's own expiry. The money landed four minutes after
    // that. The client is wrong to re-quote mid-checkout, but no client
    // controls a sleeping tab or a 3-D Secure detour, and every one of those
    // ends here. The Commit is server-side against a paid Session; it needs the
    // seat, not a token minted by a client that has since navigated away.
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.established = { quoteId: quote.id, holdId: hold.id }

    await harness.module.quoteSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "requote_before_payment_lands" },
      ANONYMOUS_ACCESS,
    )
    expect(harness.repository.holds.get(hold.id)?.state).toBe("released")

    const settled = await harness.module.commitPaidSession({
      bookingSessionId: session.id,
      paymentSessionId: "payment_session_1",
    })

    expect(harness.inventory.bookingIds).toEqual([settled.bookingId])
    const reestablished = [...harness.repository.holds.values()].find((row) => row.id !== hold.id)
    expect(reestablished).toMatchObject({
      quoteId: quote.id,
      quantity: hold.quantity,
      state: "converted",
    })
    expect(
      [...harness.repository.auditEvents.values()].find(
        (event) => event.action === "hold" && event.metadata.reason === "settlement_reestablished",
      ),
    ).toMatchObject({ actorKind: "system", metadata: { previousHoldId: hold.id } })
  })

  it("re-takes the capacity for an aggregate target too, not only a bare Product", async () => {
    // An aggregate target is not in `holdRequired` — plenty of Trips carry no
    // owned capacity at all — but one that does is refused `hold_failure:
    // missing` by the composite handler when no Hold reaches it. Keying the
    // retake off `holdRequired` alone skipped it for exactly those Bookings,
    // and the refusal is now permanent, so the captured payment would have
    // dead-lettered on the first attempt instead of recovering.
    const payment = createPaymentHarness()
    const committedWith: Array<string | undefined> = []
    const harness = createHarness({}, payment.ports, async (input) => {
      committedWith.push(input.hold?.id)
      if (!input.hold) {
        return { kind: "hold_failure", nextAction: "request_new_hold", reason: "missing" }
      }
      const bookings = [
        { componentId: "trcp_owned", bookingId: "book_owned", allocationIds: ["ball_owned"] },
      ]
      await input.consumeSources({}, bookings)
      return { kind: "committed", bookings }
    })
    const { session, quote, hold } = await createCompositeQuoteAndHold(harness)
    payment.established = { quoteId: quote.id, holdId: hold.id }

    // Released by a re-quote, which reads back as `null` rather than
    // `"expired"` — the shape the first cut of this missed.
    await harness.module.quoteSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "requote_composite" },
      ANONYMOUS_ACCESS,
    )
    expect(harness.repository.holds.get(hold.id)?.state).toBe("released")

    const settled = await harness.module.commitPaidSession({
      bookingSessionId: session.id,
      paymentSessionId: "payment_session_1",
    })

    expect(settled.bookingId).toBe("book_owned")
    const reestablished = [...harness.repository.holds.values()].find((row) => row.id !== hold.id)
    expect(committedWith).toEqual([reestablished?.id])
  })

  it("does not report a seat as gone when the shopper's own newer Hold is on it", async () => {
    // The same client that re-quotes mid-checkout may re-hold too, leaving a
    // live Hold bound to a Quote the money was never collected against. It is
    // the same shopper, the same Session and the same seat, so refusing the
    // settlement because of it would strand a payment against capacity that is
    // there — and `capacity_unavailable` is the one verdict that must only ever
    // mean the seat is genuinely gone.
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.established = { quoteId: quote.id, holdId: hold.id }

    const requoted = await harness.module.quoteSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "requote_before_payment_lands" },
      ANONYMOUS_ACCESS,
    )
    if (requoted.kind !== "quote_created") throw new Error("re-quote failed")
    const reheld = await harness.module.placeHold(
      session.id,
      {
        expectedRevision: requoted.session.revision,
        quoteId: requoted.quote.id,
        idempotencyKey: "rehold_before_payment_lands",
      },
      ANONYMOUS_ACCESS,
    )
    if (reheld.kind !== "hold_created") throw new Error("re-hold failed")

    const settled = await harness.module.commitPaidSession({
      bookingSessionId: session.id,
      paymentSessionId: "payment_session_1",
    })

    expect(harness.inventory.bookingIds).toEqual([settled.bookingId])
    expect(harness.repository.holds.get(reheld.hold.id)?.state).toBe("released")
  })

  it("does not compete with the seat its own earlier attempt re-took", async () => {
    // Settlement is a retry chain and every attempt arrives with the same
    // recorded (stale) Hold id, so a retake that is not idempotent asks for
    // capacity the previous attempt is already holding — and reports
    // `capacity_unavailable` for a seat it reserved itself.
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.established = { quoteId: quote.id, holdId: hold.id }
    await harness.module.quoteSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "requote_before_payment_lands" },
      ANONYMOUS_ACCESS,
    )
    // The first attempt re-takes the seat and then fails downstream.
    harness.inventory.failNextCommit("booking store unreachable")

    await expect(
      harness.module.commitPaidSession({
        bookingSessionId: session.id,
        paymentSessionId: "payment_session_1",
      }),
    ).rejects.toThrow("booking store unreachable")

    const settled = await harness.module.commitPaidSession({
      bookingSessionId: session.id,
      paymentSessionId: "payment_session_1",
    })

    expect(harness.inventory.bookingIds).toEqual([settled.bookingId])
    // One retake, not one per attempt.
    expect([...harness.repository.holds.values()].filter((row) => row.id !== hold.id)).toHaveLength(
      1,
    )
  })

  it("strands the payment only when the capacity is genuinely gone", async () => {
    // The distinction voyant#4692 asks for: "the Hold vanished" and "there is no
    // seat" arrive as the same `hold_failure` today, and only the second should
    // ever leave a captured payment with nothing to show for it.
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.established = { quoteId: quote.id, holdId: hold.id }

    await harness.module.quoteSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "requote_before_payment_lands" },
      ANONYMOUS_ACCESS,
    )
    harness.inventory.setCapacity("product:prod_owned_1", 0)

    const refusal = await harness.module
      .commitPaidSession({
        bookingSessionId: session.id,
        paymentSessionId: "payment_session_1",
      })
      .catch((error: unknown) => error)

    expect((refusal as Error).message).toBe(
      "booking_session_settlement_commit_rejected:hold_failure:capacity_unavailable",
    )
    // Loudly and immediately, so the stranded-payment alert names this verdict
    // rather than whatever the eighth attempt three quarters of an hour later
    // happens to report.
    expect(isPermanentSubscriberError(refusal)).toBe(true)
    expect(harness.inventory.bookingIds).toEqual([])
  })

  it("settles a paid Session whose own shopping clock has already lapsed", async () => {
    // voyant#4733. The third half of the same story: the refusal path stopped
    // tearing the Quote and Hold down, but the Session's own TTL still ran, and
    // the commit preflight expired a lapsed Session before looking at who was
    // asking. That expiry releases the Hold, expires the Quote and moves the
    // Session out of `active` — every input the settlement needs — so the
    // retry that arrived next answered `session_expired`, and so did every one
    // after it.
    //
    // The window was minutes: the payment session's expiry is the earliest of
    // the Session, Quote and Hold, so a settlement that failed once for any
    // reason usually had less than the Session's remaining TTL to recover.
    const payment = createPaymentHarness()
    // The Session is the earliest of the three clocks, which is the reported
    // shape: the payment session's own expiry is `earliest(session, quote,
    // hold)`, and in the live case it was under four minutes from capture.
    const harness = createHarness(
      { sessionTtlMs: 60_000, quoteTtlMs: 600_000, holdTtlMs: 600_000 },
      payment.ports,
    )
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.established = { quoteId: quote.id, holdId: hold.id }
    payment.inFlight = true
    harness.advance(120_000)

    const settled = await harness.module.commitPaidSession({
      bookingSessionId: session.id,
      paymentSessionId: "payment_session_1",
    })

    expect(harness.inventory.bookingIds).toEqual([settled.bookingId])
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("consumed")
  })

  it("settles a lapsed Session on a payments port that cannot say what is in flight", async () => {
    // `hasInFlight` is optional on the port, so a runtime that omits it answers
    // `undefined` — and a guard that asks it reads that as "no money here" and
    // expires the Session the settlement came to settle. The authority the
    // caller holds is the fact that does not depend on anyone implementing
    // anything, so the preflight keys on that too.
    const payment = createPaymentHarness()
    const harness = createHarness(
      { sessionTtlMs: 60_000, quoteTtlMs: 600_000, holdTtlMs: 600_000 },
      { ...payment.ports, hasInFlight: undefined },
    )
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.established = { quoteId: quote.id, holdId: hold.id }
    harness.advance(120_000)

    const settled = await harness.module.commitPaidSession({
      bookingSessionId: session.id,
      paymentSessionId: "payment_session_1",
    })

    expect(harness.inventory.bookingIds).toEqual([settled.bookingId])
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("consumed")
  })

  it("does not sweep away a lapsed Session whose money is with a processor", async () => {
    // The same door, opened by the expiry sweep rather than the commit. Both
    // reach `expireSession`, which is where the guard lives.
    const payment = createPaymentHarness()
    const harness = createHarness({ sessionTtlMs: 60_000 }, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.inFlight = true
    harness.advance(120_000)

    const swept = await harness.module.expireDueSessions(
      { limit: 10 },
      { actorKind: "staff", staffAuthority: { admitted: true, reason: "sweep" } },
    )

    // Counted as skipped, not as expired: a sweep that reported work it did not
    // do would go on reporting it every pass.
    expect(swept).toEqual({ expired: 0 })
    expect(harness.repository.sessions.get(session.id)?.state).toBe("active")
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("active")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("active")
  })

  it("sweeps a lapsed Session once its handoff has lapsed with it", async () => {
    // The other direction, which the guard must not break: a shopper who opened
    // a checkout page and walked away leaves no settled money, so the Session
    // is still ordinary rubbish and the sweep must still collect it.
    const payment = createPaymentHarness()
    const harness = createHarness({ sessionTtlMs: 60_000 }, payment.ports)
    const { session } = await createQuoteAndHold(harness)
    harness.advance(120_000)

    const swept = await harness.module.expireDueSessions(
      { limit: 10 },
      { actorKind: "staff", staffAuthority: { admitted: true, reason: "sweep" } },
    )

    expect(swept).toEqual({ expired: 1 })
    expect(harness.repository.sessions.get(session.id)?.state).toBe("expired")
  })

  it("refuses to abandon a Session whose money is with a processor", async () => {
    // Abandon tears down exactly what a settlement needs, and it was the one
    // lifecycle door with no in-flight guard on it — which is unfortunate,
    // because it is what a "start over" button calls.
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)
    payment.inFlight = true

    const outcome = await harness.module.abandonSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "abandon_while_paying" },
      ANONYMOUS_ACCESS,
    )

    expect(outcome).toEqual({
      kind: "rejected",
      error: { kind: "payment_in_flight", nextAction: "await_payment_outcome" },
    })
    expect(harness.repository.sessions.get(session.id)?.state).toBe("active")
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("active")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("active")
  })

  it("publishes a requirementsFingerprint a Commit accepts, without a fresh Quote", async () => {
    // voyant#4733's first trap: Commit requires a fingerprint and only a Quote
    // used to produce one, so a host that lost its Quote response had no call
    // left that could finish a booking it had already been paid for — quoting
    // is refused while the payment is settled, and correctly so.
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)

    const resumed = await harness.module.resumeSession(session.id, ANONYMOUS_ACCESS)
    if (resumed.kind !== "session_resumed") throw new Error("session not resumed")
    expect(resumed.session.requirementsFingerprint).toBe(quote.requirementsFingerprint)

    payment.established = true
    const committed = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: resumed.session.revision,
        quoteId: quote.id,
        // The value read off the Session, not off the Quote response.
        requirementsFingerprint: resumed.session.requirementsFingerprint!,
        holdId: hold.id,
        idempotencyKey: "commit_from_session_fingerprint",
      },
      ANONYMOUS_ACCESS,
    )

    expect(committed).toMatchObject({ kind: "commit_result", outcome: { kind: "committed" } })
  })

  it("commits a paid Session without the shopper capability and converges retries", async () => {
    const payment = createPaymentHarness()
    payment.established = true
    const harness = createHarness({}, payment.ports)
    const { session } = await createQuoteAndHold(harness)

    const first = await harness.module.commitPaidSession({
      bookingSessionId: session.id,
      paymentSessionId: "payment_session_1",
    })
    const retry = await harness.module.commitPaidSession({
      bookingSessionId: session.id,
      paymentSessionId: "payment_session_1",
    })

    expect(retry).toEqual(first)
    expect(harness.inventory.bookingIds).toEqual([first.bookingId])
    expect(payment.transfers).toEqual([
      expect.objectContaining({
        paymentSessionId: "payment_session_1",
        bookingSessionId: session.id,
        bookingId: first.bookingId,
      }),
    ])
    expect(
      [...harness.repository.auditEvents.values()].find((event) => event.action === "commit"),
    ).toMatchObject({
      actorKind: "system",
      authorityReason: "paid booking session settlement",
    })
  })

  it("converges a settlement commit racing the returning shopper", async () => {
    const payment = createPaymentHarness()
    payment.established = true
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)

    const [settled] = await Promise.all([
      harness.module.commitPaidSession({
        bookingSessionId: session.id,
        paymentSessionId: "payment_session_1",
      }),
      harness.module.commitSession(
        session.id,
        {
          expectedRevision: session.revision,
          quoteId: quote.id,
          requirementsFingerprint: quote.requirementsFingerprint,
          holdId: hold.id,
          idempotencyKey: "returning_shopper_commit",
        },
        ANONYMOUS_ACCESS,
      ),
    ])

    expect(harness.inventory.bookingIds).toEqual([settled.bookingId])
    expect(harness.repository.commits.size).toBe(1)
    expect(payment.transfers).toHaveLength(1)
  })

  it("returns a typed conflict when a reused Commit key maps to a changed payment requirement", async () => {
    const payment = createPaymentHarness()
    payment.ports.prepare = async () => {
      throw new Error("booking_session_payment_idempotency_conflict")
    }
    const harness = createHarness({}, payment.ports)
    const { session, quote, hold } = await createQuoteAndHold(harness)

    await expect(
      harness.module.commitSession(
        session.id,
        {
          expectedRevision: session.revision,
          quoteId: quote.id,
          requirementsFingerprint: quote.requirementsFingerprint,
          holdId: hold.id,
          idempotencyKey: "commit_changed_payment_requirement",
        },
        ANONYMOUS_ACCESS,
      ),
    ).resolves.toMatchObject({ kind: "rejected", error: { kind: "idempotency_conflict" } })
    expect(harness.inventory.bookingIds).toEqual([])
    expect(harness.repository.sessions.get(session.id)?.state).toBe("active")
  })

  it("expires pending Session payments when the journey is abandoned", async () => {
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    const { session, hold } = await createQuoteAndHold(harness)

    await harness.module.abandonSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "abandon_payment_pending" },
      ANONYMOUS_ACCESS,
    )

    expect(payment.expirations).toEqual([expect.objectContaining({ bookingSessionId: session.id })])
    expect(harness.repository.holds.get(hold.id)?.state).toBe("released")
  })

  it("requires the caller-held anonymous Session capability before mutation", async () => {
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("create_requires_cap"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    const rejected = await harness.module.quoteSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        idempotencyKey: "quote_without_capability",
      },
      { actorKind: "anonymous" },
    )

    expect(rejected).toMatchObject({
      kind: "rejected",
      error: { kind: "capability_required" },
    })
    expect(harness.repository.quotes.size).toBe(0)
  })

  it("pins storefront provenance internally without serializing or auditing it", async () => {
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("storefront_provenance_private"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    expect(harness.repository.sessions.get(created.session.id)?.storefrontOrigin).toEqual(
      STOREFRONT_ACCESS.storefront,
    )
    expect(JSON.stringify(created)).not.toContain("sf_public")
    expect(JSON.stringify(created)).not.toContain("chan_public")

    const resumed = await harness.module.resumeSession(created.session.id, ANONYMOUS_ACCESS)
    expect(resumed).toMatchObject({ kind: "session_resumed" })
    expect(JSON.stringify(resumed)).not.toContain("sf_public")
    expect(JSON.stringify([...harness.repository.auditEvents.values()])).not.toContain("sf_public")
    expect(JSON.stringify([...harness.repository.auditEvents.values()])).not.toContain(
      "chan_public",
    )
  })

  it("rejects a valid capability presented from another active storefront", async () => {
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("cross_storefront_capability"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    await expect(
      harness.module.resumeSession(created.session.id, {
        ...ANONYMOUS_ACCESS,
        storefront: { storefrontId: "sf_other", channelId: "chan_other" },
      }),
    ).resolves.toMatchObject({ kind: "rejected", error: { kind: "not_authorized" } })
  })

  it("authenticates the anonymous capability before checking storefront provenance", async () => {
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("capability_before_storefront"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    await expect(
      harness.module.resumeSession(created.session.id, {
        actorKind: "anonymous",
        capability: `bcap_${"b".repeat(43)}`,
        storefront: { storefrontId: "sf_other", channelId: "chan_other" },
      }),
    ).resolves.toMatchObject({ kind: "rejected", error: { kind: "capability_required" } })

    await expect(
      harness.module.adoptSession(
        created.session.id,
        { expectedRevision: 1, idempotencyKey: "adopt_wrong_capability_and_storefront" },
        {
          actorKind: "customer",
          principalId: "customer_1",
          capability: `bcap_${"b".repeat(43)}`,
          storefront: { storefrontId: "sf_other", channelId: "chan_other" },
        },
      ),
    ).resolves.toMatchObject({ kind: "rejected", error: { kind: "capability_required" } })
  })

  it("fails closed for legacy public rows without provenance while preserving partner access", async () => {
    const harness = createHarness()
    const anonymous = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("legacy_public_origin"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (anonymous.kind !== "session_created") throw new Error("session not created")
    const legacy = harness.repository.sessions.get(anonymous.session.id)
    if (!legacy) throw new Error("session not persisted")
    legacy.storefrontOrigin = undefined
    await harness.repository.saveSession(legacy)

    await expect(
      harness.module.resumeSession(anonymous.session.id, ANONYMOUS_ACCESS),
    ).resolves.toMatchObject({ kind: "rejected", error: { kind: "not_authorized" } })

    const partnerAccess = { actorKind: "partner" as const, principalId: "partner_1" }
    const partner = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("partner_origin_neutral"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      partnerAccess,
    )
    if (partner.kind !== "session_created") throw new Error("partner session not created")
    await expect(
      harness.module.resumeSession(partner.session.id, partnerAccess),
    ).resolves.toMatchObject({ kind: "session_resumed" })
  })

  it("replays or rejects create idempotency before creating duplicate Sessions", async () => {
    const harness = createHarness()
    const input = {
      idempotencyKey: "create_idem_key",
      target: { kind: "product" as const, productId: "prod_owned_1" },
      selection: { departureSlotId: "slot_one" },
    }
    const createAccess = { ...ANONYMOUS_ACCESS, capability: `bcap_${"b".repeat(43)}` }

    const first = await harness.module.createSession(input, createAccess)
    const replay = await harness.module.createSession(input, createAccess)
    const conflict = await harness.module.createSession(
      {
        ...input,
        selection: { departureSlotId: "slot_two" },
      },
      createAccess,
    )

    expect(first).toMatchObject({ kind: "session_created" })
    expect(replay).toMatchObject({
      kind: "session_created",
      session: { id: first.kind === "session_created" ? first.session.id : "" },
    })
    expect(replay).not.toHaveProperty("capability")
    expect(conflict).toMatchObject({
      kind: "rejected",
      error: { kind: "idempotency_conflict" },
    })
    expect(harness.repository.sessions.size).toBe(1)
  })

  it("seeds exactly one Trip Snapshot Session without exposing its internal target publicly", async () => {
    const harness = createHarness()
    const input = {
      idempotencyKey: "proposal_session_seed",
      proposalId: "prps_accepted",
      proposalVersionId: "prvr_accepted",
      tripSnapshotId: "trsn_frozen",
      tripEnvelopeId: "trip_composed",
      selection: { billing: { contact: { email: "guest@example.com" } } },
    }

    const first = await harness.module.createAcceptedProposalSession(input, ANONYMOUS_ACCESS)
    const replay = await harness.module.createAcceptedProposalSession(input, ANONYMOUS_ACCESS)

    expect(first).toMatchObject({
      kind: "session_created",
      session: {
        target: { kind: "managed_itinerary" },
      },
    })
    expect(JSON.stringify(first)).not.toMatch(/trsn_frozen|trip_composed|prps_accepted/)
    expect(harness.repository.sessions.values().next().value).toMatchObject({
      target: {
        kind: "trip_snapshot",
        tripSnapshotId: "trsn_frozen",
        tripEnvelopeId: "trip_composed",
      },
    })
    expect(replay).toEqual(first)
    expect(harness.repository.sessions.size).toBe(1)
  })

  it("prices a server-owned composite target before creating its Session", async () => {
    const harness = createHarness()
    const outcome = await harness.module.createCompositeSession(
      {
        idempotencyKey: "managed_trip_create",
        target: {
          kind: "trip_snapshot",
          tripSnapshotId: "trsn_frozen",
          tripEnvelopeId: "trip_composed",
        },
      },
      ANONYMOUS_ACCESS,
    )

    expect(outcome).toMatchObject({
      kind: "session_created",
      session: { target: { kind: "managed_itinerary" } },
    })
    expect(harness.repository.sessions.size).toBe(1)
  })

  it("consumes one aggregate Session into independently accountable Component Bookings", async () => {
    const harness = createHarness({}, undefined, async (input) => {
      const bookings = [
        {
          componentId: "trcp_owned",
          bookingId: "book_owned",
          allocationIds: ["ball_owned"],
        },
        {
          componentId: "trcp_sourced",
          bookingId: "book_sourced",
          allocationIds: ["ball_sourced"],
          supplierOperationId: "suop_sourced",
        },
      ]
      await input.consumeSources({}, bookings)
      return { kind: "committed", bookings }
    })
    const created = await harness.module.createAcceptedProposalSession(
      {
        idempotencyKey: "proposal_component_commit",
        proposalId: "prps_accepted",
        proposalVersionId: "prvr_accepted",
        tripSnapshotId: "trsn_frozen",
        tripEnvelopeId: "trip_composed",
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await harness.module.quoteSession(
      created.session.id,
      { expectedRevision: 1, idempotencyKey: "quote_components" },
      ANONYMOUS_ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    const held = await harness.module.placeHold(
      created.session.id,
      {
        expectedRevision: 1,
        quoteId: quoted.quote.id,
        idempotencyKey: "hold_components",
      },
      ANONYMOUS_ACCESS,
    )
    if (held.kind !== "hold_created") throw new Error("hold not created")

    const committed = await harness.module.commitSession(
      created.session.id,
      {
        expectedRevision: 1,
        quoteId: quoted.quote.id,
        requirementsFingerprint: quoted.quote.requirementsFingerprint,
        holdId: held.hold.id,
        idempotencyKey: "commit_components",
      },
      ANONYMOUS_ACCESS,
    )
    const replay = await harness.module.commitSession(
      created.session.id,
      {
        expectedRevision: 1,
        quoteId: quoted.quote.id,
        requirementsFingerprint: quoted.quote.requirementsFingerprint,
        holdId: held.hold.id,
        idempotencyKey: "commit_components",
      },
      ANONYMOUS_ACCESS,
    )

    expect(committed).toMatchObject({
      kind: "commit_result",
      outcome: {
        kind: "component_bookings_committed",
        bookings: [
          { componentId: "trcp_owned", bookingId: "book_owned" },
          {
            componentId: "trcp_sourced",
            bookingId: "book_sourced",
            supplierOperationId: "suop_sourced",
          },
        ],
        consumedSessionId: created.session.id,
        consumedQuoteId: quoted.quote.id,
      },
    })
    expect(replay).toMatchObject({
      kind: "commit_result",
      outcome: {
        kind: "idempotent_replay",
        originalOutcome: { kind: "component_bookings_committed" },
      },
    })
    expect(harness.repository.sessions.get(created.session.id)?.state).toBe("consumed")
  })

  it("keeps the aggregate Session open for manual and supplier continuation", async () => {
    const harness = createHarness({}, undefined, async () => ({
      kind: "component_commit_pending",
      nextAction: "continue_component_commit",
      components: [
        {
          componentId: "trcp_live",
          state: "supplier_pending",
          supplierOperationId: "suop_live",
        },
        { componentId: "trcp_manual", state: "manual_confirmation_required" },
      ],
    }))
    const created = await harness.module.createAcceptedProposalSession(
      {
        idempotencyKey: "proposal_pending_commit",
        proposalId: "prps_pending",
        proposalVersionId: "prvr_pending",
        tripSnapshotId: "trsn_frozen",
        tripEnvelopeId: "trip_composed",
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await harness.module.quoteSession(
      created.session.id,
      { expectedRevision: 1, idempotencyKey: "quote_pending_components" },
      ANONYMOUS_ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")

    const result = await harness.module.commitSession(
      created.session.id,
      {
        expectedRevision: 1,
        quoteId: quoted.quote.id,
        requirementsFingerprint: quoted.quote.requirementsFingerprint,
        idempotencyKey: "commit_pending_components",
      },
      ANONYMOUS_ACCESS,
    )

    expect(result).toMatchObject({
      kind: "commit_result",
      outcome: {
        kind: "component_commit_pending",
        components: [
          { componentId: "trcp_live", state: "supplier_pending" },
          { componentId: "trcp_manual", state: "manual_confirmation_required" },
        ],
      },
    })
    expect(harness.repository.sessions.get(created.session.id)?.state).toBe("supplier_pending")
    expect(harness.repository.commits.size).toBe(0)
  })

  it("distinguishes manual component work from a pending supplier operation", async () => {
    const harness = createHarness({}, undefined, async () => ({
      kind: "component_commit_pending",
      nextAction: "continue_component_commit",
      components: [{ componentId: "trcp_manual", state: "manual_confirmation_required" }],
    }))
    const created = await harness.module.createAcceptedProposalSession(
      {
        idempotencyKey: "proposal_manual_pending",
        proposalId: "prps_manual_pending",
        proposalVersionId: "prvr_manual_pending",
        tripSnapshotId: "trsn_manual_pending",
        tripEnvelopeId: "trip_manual_pending",
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await harness.module.quoteSession(
      created.session.id,
      { expectedRevision: 1, idempotencyKey: "quote_manual_pending" },
      ANONYMOUS_ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")

    await harness.module.commitSession(
      created.session.id,
      {
        expectedRevision: 1,
        quoteId: quoted.quote.id,
        requirementsFingerprint: quoted.quote.requirementsFingerprint,
        idempotencyKey: "commit_manual_pending",
      },
      ANONYMOUS_ACCESS,
    )

    expect(harness.repository.sessions.get(created.session.id)?.state).toBe("component_pending")
  })

  it("creates no Booking or Allocation residue before Commit, then commits exactly once", async () => {
    const { harness, session, capability, quote, hold } = await createQuoteAndHold()

    expect(harness.inventory.bookingIds).toEqual([])
    expect(harness.inventory.allocationIds).toEqual([])

    const committed = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
        requirementsFingerprint: quote.requirementsFingerprint,
        holdId: hold.id,
        idempotencyKey: "commit_key",
      },
      { ...ANONYMOUS_ACCESS, capability },
    )

    expect(committed).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "committed", consumedSessionId: session.id, consumedQuoteId: quote.id },
    })
    expect(harness.inventory.bookingIds).toHaveLength(1)
    expect(harness.inventory.allocationIds).toHaveLength(1)
    expect(harness.repository.sessions.get(session.id)?.state).toBe("consumed")
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("consumed")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("converted")
  })

  it("increments revision on price-relevant updates and hard-rejects superseded Quotes", async () => {
    const { harness, session, capability, quote } = await createQuoteAndHold()

    const updated = await harness.module.updateSession(
      session.id,
      {
        idempotencyKey: "update_key",
        expectedRevision: session.revision,
        selection: { departureSlotId: "slot_later" },
      },
      { ...ANONYMOUS_ACCESS, capability },
    )

    expect(updated).toMatchObject({ kind: "session_updated", session: { revision: 2 } })
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("superseded")

    const rejected = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: 2,
        quoteId: quote.id,
        requirementsFingerprint: quote.requirementsFingerprint,
        holdId: "missing_hold",
        idempotencyKey: "commit_stale_quote",
      },
      { ...ANONYMOUS_ACCESS, capability },
    )
    expect(rejected).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "quote_failure", reason: "superseded" },
    })
    expect(harness.inventory.bookingIds).toEqual([])
  })

  /**
   * A quote whose pricing carries a policy snapshot.
   *
   * `captureCancellationPolicySnapshot` stamps `capturedAt` with `new Date()`,
   * so every compose of the same unchanged selection returns a different one.
   * The counter here stands in for the clock.
   */
  function policyPricing(total = 10000) {
    let captures = 0
    return () => {
      captures += 1
      return {
        ...BASE_PRICING,
        lines: [{ ...BASE_PRICING.lines[0]!, unitAmount: total, totalAmount: total }],
        subtotal: total,
        total,
        policyEvidence: {
          cancellation: {
            schemaVersion: 1,
            policyId: "pol_1",
            policyVersionId: "plvr_1",
            version: 1,
            capturedAt: new Date(1_760_000_000_000 + captures * 1000).toISOString(),
            rules: [
              {
                id: "plrl_1",
                daysBeforeDeparture: 30,
                refundPercent: 10000,
                refundType: "cash",
                flatAmountCents: null,
                currency: null,
                label: "30 days or more",
              },
            ],
          },
        },
      } as PricingBreakdownV1
    }
  }

  it("commits against a Quote whose policy snapshot was re-captured at Commit", async () => {
    // voyant#4689: the Commit preflight re-composes the Quote and compares price
    // fingerprints. With the capture instant inside the fingerprint the two can
    // never agree, so every Commit was refused `quote_failure / superseded` and
    // the Hold released - checkout down for any product with a published
    // cancellation policy, on the first attempt, with no race involved.
    const payment = createPaymentHarness()
    const harness = createHarness({}, payment.ports)
    harness.setPricePerCompose(policyPricing())
    const { session, quote, hold } = await createQuoteAndHold(harness)

    const committed = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
        requirementsFingerprint: quote.requirementsFingerprint,
        holdId: hold.id,
        idempotencyKey: "commit_recaptured_policy",
        checkoutIntent: "card" as const,
      },
      ANONYMOUS_ACCESS,
    )

    expect(committed).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "payment_required" },
    })
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("active")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("active")
  })

  it("fingerprints two composes of one unchanged selection identically", async () => {
    const harness = createHarness()
    harness.setPricePerCompose(policyPricing())
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("stable_fingerprint"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    const first = await harness.module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_1" },
      ANONYMOUS_ACCESS,
    )
    const second = await harness.module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_2" },
      ANONYMOUS_ACCESS,
    )
    if (first.kind !== "quote_created" || second.kind !== "quote_created") {
      throw new Error("quotes not created")
    }

    const left = harness.repository.quotes.get(first.quote.id)
    const right = harness.repository.quotes.get(second.quote.id)
    // Different capture instants, same price: one fingerprint.
    expect(left?.pricing).not.toEqual(right?.pricing)
    expect(left?.priceFingerprint).toBe(right?.priceFingerprint)
  })

  it("still supersedes a Quote whose price actually moved", async () => {
    // The half of the invariant that must not be traded away for the fix above:
    // a real price change still has to invalidate the Quote.
    const harness = createHarness()
    harness.setPricePerCompose(policyPricing(10000))
    const { session, capability, quote, hold } = await createQuoteAndHold(harness)
    harness.setPricePerCompose(policyPricing(12500))

    const rejected = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
        requirementsFingerprint: quote.requirementsFingerprint,
        holdId: hold.id,
        idempotencyKey: "commit_real_price_change",
        checkoutIntent: "card" as const,
      },
      { ...ANONYMOUS_ACCESS, capability },
    )

    expect(rejected).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "quote_failure", reason: "superseded" },
    })
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("superseded")
    expect(harness.inventory.bookingIds).toEqual([])
  })

  it("still supersedes a Quote whose cancellation policy version changed", async () => {
    // Policy identity stays inside the fingerprint: only the capture instant
    // leaves. A traveller must not be booked onto refund terms they never saw.
    const harness = createHarness()
    harness.setPricePerCompose(policyPricing())
    const { session, capability, quote, hold } = await createQuoteAndHold(harness)
    harness.setPricePerCompose(() => {
      const pricing = policyPricing()() as PricingBreakdownV1 & {
        policyEvidence: { cancellation: Record<string, unknown> }
      }
      pricing.policyEvidence.cancellation.policyVersionId = "plvr_2"
      pricing.policyEvidence.cancellation.version = 2
      return pricing
    })

    const rejected = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
        requirementsFingerprint: quote.requirementsFingerprint,
        holdId: hold.id,
        idempotencyKey: "commit_policy_version_change",
        checkoutIntent: "card" as const,
      },
      { ...ANONYMOUS_ACCESS, capability },
    )

    expect(rejected).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "quote_failure", reason: "superseded" },
    })
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("superseded")
  })

  it("reuses the transaction-locked Session and supersedes Quotes in one repository operation", async () => {
    const { harness, session, capability, quote } = await createQuoteAndHold()
    let getSessionCalls = 0
    let supersedeCalls = 0
    const getSession = harness.repository.getSession.bind(harness.repository)
    const supersedeActiveQuotes = harness.repository.supersedeActiveQuotes!.bind(harness.repository)
    harness.repository.getSession = async (sessionId) => {
      getSessionCalls += 1
      return getSession(sessionId)
    }
    harness.repository.supersedeActiveQuotes = async (sessionId) => {
      supersedeCalls += 1
      return supersedeActiveQuotes(sessionId)
    }
    harness.repository.listActiveQuotes = async () => {
      throw new Error("update should not load Quotes before superseding them")
    }

    const updated = await harness.module.updateSession(
      session.id,
      {
        idempotencyKey: "update_bulk_supersede",
        expectedRevision: session.revision,
        selection: { departureSlotId: "slot_later" },
      },
      { ...ANONYMOUS_ACCESS, capability },
    )

    expect(updated).toMatchObject({ kind: "session_updated", session: { revision: 2 } })
    expect(getSessionCalls).toBe(0)
    expect(supersedeCalls).toBe(1)
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("superseded")
  })

  it("checks Hold expiry synchronously at Commit", async () => {
    const { harness, session, capability, quote, hold } = await createQuoteAndHold()
    harness.advance(61_000)

    const rejected = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
        requirementsFingerprint: quote.requirementsFingerprint,
        holdId: hold.id,
        idempotencyKey: "commit_expired_hold",
      },
      { ...ANONYMOUS_ACCESS, capability },
    )

    expect(rejected).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "hold_failure", reason: "expired" },
    })
    expect(harness.inventory.bookingIds).toEqual([])
    expect(harness.repository.holds.get(hold.id)?.state).toBe("expired")
    expect(harness.inventory.hasActiveHold(hold.id)).toBe(false)
  })

  it("expires a Quote and releases its still-live capacity in the same observation", async () => {
    const harness = createHarness({ quoteTtlMs: 60_000, holdTtlMs: 10 * 60_000 })
    const { session, capability, quote, hold } = await createQuoteAndHold(harness)
    harness.advance(61_000)

    const rejected = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
        requirementsFingerprint: quote.requirementsFingerprint,
        holdId: hold.id,
        idempotencyKey: "commit_expired_quote",
      },
      { ...ANONYMOUS_ACCESS, capability },
    )

    expect(rejected).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "quote_failure", reason: "expired" },
    })
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("expired")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("released")
    expect(harness.inventory.hasActiveHold(hold.id)).toBe(false)
  })

  it("expires a Session, its Quote, and its live Hold atomically when observed", async () => {
    const harness = createHarness({
      sessionTtlMs: 30_000,
      quoteTtlMs: 10 * 60_000,
      holdTtlMs: 10 * 60_000,
    })
    const { session, capability, quote, hold } = await createQuoteAndHold(harness)
    harness.advance(31_000)

    const rejected = await harness.module.quoteSession(
      session.id,
      {
        expectedRevision: session.revision,
        idempotencyKey: "quote_after_session_expiry",
      },
      { ...ANONYMOUS_ACCESS, capability },
    )

    expect(rejected).toMatchObject({ kind: "rejected", error: { kind: "session_expired" } })
    expect(harness.repository.sessions.get(session.id)?.state).toBe("expired")
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("expired")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("released")
    expect(harness.inventory.hasActiveHold(hold.id)).toBe(false)
  })

  it("sweeps idle expired Sessions and releases live Holds under admitted authority", async () => {
    const harness = createHarness({
      sessionTtlMs: 30_000,
      quoteTtlMs: 10 * 60_000,
      holdTtlMs: 10 * 60_000,
    })
    const { session, quote, hold } = await createQuoteAndHold(harness)
    harness.advance(31_000)

    await expect(
      harness.module.expireDueSessions(
        { limit: 10 },
        {
          actorKind: "staff",
          principalId: "staff_1",
          staffAuthority: { admitted: true, reason: "scheduled_retention" },
        },
      ),
    ).resolves.toEqual({ expired: 1 })
    expect(harness.repository.sessions.get(session.id)?.state).toBe("expired")
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("expired")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("released")
    expect(harness.inventory.hasActiveHold(hold.id)).toBe(false)
  })

  it("replays a stable idempotency key without creating another Booking", async () => {
    const { harness, session, capability, quote, hold } = await createQuoteAndHold()
    const input = {
      expectedRevision: session.revision,
      quoteId: quote.id,
      requirementsFingerprint: quote.requirementsFingerprint,
      holdId: hold.id,
      idempotencyKey: "commit_replay_key",
    }

    const access = { ...ANONYMOUS_ACCESS, capability }
    const first = await harness.module.commitSession(session.id, input, access)
    const second = await harness.module.commitSession(session.id, input, access)

    expect(first).toMatchObject({ kind: "commit_result", outcome: { kind: "committed" } })
    if (first.kind !== "commit_result" || first.outcome.kind !== "committed") {
      throw new Error("commit did not succeed")
    }
    expect(second).toMatchObject({
      kind: "commit_result",
      outcome: {
        kind: "idempotent_replay",
        originalOutcome: { kind: "committed", booking: { id: first.outcome.booking.id } },
      },
    })
    expect(harness.inventory.bookingIds).toHaveLength(1)
    expect(harness.inventory.allocationIds).toHaveLength(1)
  })

  it("returns idempotency_conflict when the same update key carries a different fingerprint", async () => {
    const { harness, session, capability } = await createQuoteAndHold()
    const access = { ...ANONYMOUS_ACCESS, capability }

    const first = await harness.module.updateSession(
      session.id,
      {
        idempotencyKey: "update_conflict_key",
        expectedRevision: session.revision,
        selection: { departureSlotId: "slot_one" },
      },
      access,
    )
    const second = await harness.module.updateSession(
      session.id,
      {
        idempotencyKey: "update_conflict_key",
        expectedRevision: session.revision,
        selection: { departureSlotId: "slot_two" },
      },
      access,
    )

    expect(first).toMatchObject({ kind: "session_updated" })
    expect(second).toMatchObject({ kind: "rejected", error: { kind: "idempotency_conflict" } })
  })

  it("prevents double Commit with different idempotency keys after consumption", async () => {
    const { harness, session, capability, quote, hold } = await createQuoteAndHold()
    await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
        requirementsFingerprint: quote.requirementsFingerprint,
        holdId: hold.id,
        idempotencyKey: "commit_once",
      },
      { ...ANONYMOUS_ACCESS, capability },
    )
    const second = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
        requirementsFingerprint: quote.requirementsFingerprint,
        holdId: hold.id,
        idempotencyKey: "commit_twice",
      },
      { ...ANONYMOUS_ACCESS, capability },
    )

    expect(second).toMatchObject({ kind: "rejected", error: { kind: "commit_already_consumed" } })
    expect(harness.inventory.bookingIds).toHaveLength(1)
  })

  it("handles concurrent double Commit without duplicate Booking, Allocation, or Commit records", async () => {
    const { harness, session, capability, quote, hold } = await createQuoteAndHold()
    const access = { ...ANONYMOUS_ACCESS, capability }

    const results = await Promise.all([
      harness.module.commitSession(
        session.id,
        {
          expectedRevision: session.revision,
          quoteId: quote.id,
          requirementsFingerprint: quote.requirementsFingerprint,
          holdId: hold.id,
          idempotencyKey: "commit_concurrent_a",
        },
        access,
      ),
      harness.module.commitSession(
        session.id,
        {
          expectedRevision: session.revision,
          quoteId: quote.id,
          requirementsFingerprint: quote.requirementsFingerprint,
          holdId: hold.id,
          idempotencyKey: "commit_concurrent_b",
        },
        access,
      ),
    ])

    expect(results).toContainEqual(
      expect.objectContaining({
        kind: "commit_result",
        outcome: expect.objectContaining({ kind: "committed" }),
      }),
    )
    expect(results).toContainEqual(
      expect.objectContaining({
        kind: "rejected",
        error: expect.objectContaining({ kind: "commit_already_consumed" }),
      }),
    )
    expect(harness.inventory.bookingIds).toHaveLength(1)
    expect(harness.inventory.allocationIds).toHaveLength(1)
    expect(harness.repository.commits.size).toBe(1)
  })

  it("proves last-seat holds do not oversell owned capacity", async () => {
    const harness = createHarness()
    const a = await createQuoteAndHold(harness)
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("create_second_hold"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await harness.module.quoteSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        idempotencyKey: "quote_b",
      },
      ANONYMOUS_ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")

    const secondHold = await harness.module.placeHold(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: quoted.quote.id,
        idempotencyKey: "hold_b",
      },
      ANONYMOUS_ACCESS,
    )

    expect(a.hold.state).toBe("active")
    expect(secondHold).toMatchObject({
      kind: "rejected",
      error: { kind: "availability_changed", nextAction: "request_new_hold" },
    })
  })

  it("proves simultaneous last-seat acquisition cannot create two active Holds", async () => {
    const harness = createHarness()
    const first = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("create_last_seat_a"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    const second = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("create_last_seat_b"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (first.kind !== "session_created" || second.kind !== "session_created") {
      throw new Error("sessions not created")
    }
    const firstQuote = await harness.module.quoteSession(
      first.session.id,
      { expectedRevision: first.session.revision, idempotencyKey: "last_seat_quote_a" },
      ANONYMOUS_ACCESS,
    )
    const secondQuote = await harness.module.quoteSession(
      second.session.id,
      { expectedRevision: second.session.revision, idempotencyKey: "last_seat_quote_b" },
      ANONYMOUS_ACCESS,
    )
    if (firstQuote.kind !== "quote_created" || secondQuote.kind !== "quote_created") {
      throw new Error("quotes not created")
    }

    const results = await Promise.all([
      harness.module.placeHold(
        first.session.id,
        {
          expectedRevision: first.session.revision,
          quoteId: firstQuote.quote.id,
          idempotencyKey: "last_seat_hold_a",
        },
        ANONYMOUS_ACCESS,
      ),
      harness.module.placeHold(
        second.session.id,
        {
          expectedRevision: second.session.revision,
          quoteId: secondQuote.quote.id,
          idempotencyKey: "last_seat_hold_b",
        },
        ANONYMOUS_ACCESS,
      ),
    ])

    expect(results.filter((result) => result.kind === "hold_created")).toHaveLength(1)
    expect(
      results.filter(
        (result) => result.kind === "rejected" && result.error.kind === "availability_changed",
      ),
    ).toHaveLength(1)
    expect(
      [...harness.repository.holds.values()].filter((hold) => hold.state === "active"),
    ).toHaveLength(1)
  })

  it("rolls back Session, Quote, Hold, and Commit consumption when Booking creation faults", async () => {
    let currentNow = new Date("2026-08-01T12:00:00.000Z")
    const repository = createInMemoryBookingSessionRepository()
    const inventory = createInMemoryOwnedInventoryPorts()
    inventory.setCapacity("product:prod_owned_1", 1)
    const module = createBookingSessionModule({
      now: () => currentNow,
      ports: {
        repository,
        normalizeSelection: async ({ selection }) => selection,
        composeRequirements: inventory.composeRequirements,
        composeQuote: async () => ({
          status: "quoted",
          requirements: inMemoryBookingRequirements(),
          pricing: BASE_PRICING,
        }),
        placeCapacityHold: inventory.placeCapacityHold,
        releaseCapacityHold: inventory.releaseCapacityHold,
        commitOwnedBooking: async (input) =>
          repository.withSessionTransaction(input.session.id, async () => {
            await input.consumeSources(undefined, "book_fault", ["bkac_fault"])
            throw new Error("fault_after_booking_creation")
          }),
      },
    })
    const harness = {
      module,
      repository,
      inventory,
      advance(ms: number) {
        currentNow = new Date(currentNow.getTime() + ms)
      },
      // Same shape as `createHarness()` so `createQuoteAndHold` infers the real
      // quote record here; a narrower stub degrades it to `{ id }` and the
      // fingerprint read below stops typechecking.
      setPrice(_next: typeof BASE_PRICING) {},
      setPricePerCompose(_next: (() => PricingBreakdownV1) | null) {},
      setRequirements(_next: BookingRequirementsV1) {},
    }
    const { session, capability, quote, hold } = await createQuoteAndHold(harness)

    await expect(
      module.commitSession(
        session.id,
        {
          expectedRevision: session.revision,
          quoteId: quote.id,
          requirementsFingerprint: quote.requirementsFingerprint,
          holdId: hold.id,
          idempotencyKey: "commit_fault_key",
        },
        { ...ANONYMOUS_ACCESS, capability },
      ),
    ).rejects.toThrow("fault_after_booking_creation")

    expect(repository.sessions.get(session.id)?.state).toBe("active")
    expect(repository.quotes.get(quote.id)?.state).toBe("active")
    expect(repository.holds.get(hold.id)?.state).toBe("active")
    expect(repository.commits.size).toBe(0)
    expect(inventory.bookingIds).toEqual([])
    expect(inventory.allocationIds).toEqual([])
  })

  it("passes the reusable owned atomic Commit conformance scenario through the real module", async () => {
    const scenario = bookingLifecycleConformanceScenariosV1.find(
      (candidate) => candidate.id === "owned-atomic-commit",
    )
    if (!scenario) throw new Error("owned atomic conformance scenario missing")

    await expect(
      assertBookingLifecycleConformanceV1(
        {
          async commit(input) {
            const harness = createHarness()
            const { session, capability, quote, hold } = await createQuoteAndHold(harness)
            const result = await harness.module.commitSession(
              session.id,
              {
                expectedRevision: session.revision,
                quoteId: quote.id,
                requirementsFingerprint: quote.requirementsFingerprint,
                holdId: hold.id,
                idempotencyKey: input.idempotencyKey,
              },
              { ...ANONYMOUS_ACCESS, capability },
            )
            if (result.kind !== "commit_result") {
              throw new Error(`expected Commit outcome, received ${result.kind}`)
            }
            return {
              outcome: result.outcome,
              effects: {
                bookingCreated: harness.inventory.bookingIds.length === 1,
                allocationCreated: harness.inventory.allocationIds.length === 1,
                holdConverted: harness.repository.holds.get(hold.id)?.state === "converted",
                sessionConsumed: harness.repository.sessions.get(session.id)?.state === "consumed",
                quoteConsumed: harness.repository.quotes.get(quote.id)?.state === "consumed",
                supplierOperationPersisted: false,
                supplierDispatched: false,
                paymentGuaranteeEstablished: input.paymentGuarantee === "established",
                bookingCreatedBeforeSupplierSecured: false,
                financeStatePromotedToBookingStatus: false,
                transactionBoundary: "single",
              },
            }
          },
        },
        [scenario],
      ),
    ).resolves.toEqual([{ scenarioId: "owned-atomic-commit", passed: true }])
  })

  it("enforces explicit capability action scopes", async () => {
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("scoped_capability"),
        target: { kind: "product", productId: "prod_owned_1" },
        capabilityScopes: ["read"],
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    await expect(
      harness.module.resumeSession(created.session.id, ANONYMOUS_ACCESS),
    ).resolves.toMatchObject({ kind: "session_resumed", session: { redaction: "none" } })
    await expect(
      harness.module.updateSession(
        created.session.id,
        {
          expectedRevision: created.session.revision,
          idempotencyKey: "scope_update_denied",
          selection: { configure: { pax: { adult: 2 } } },
        },
        ANONYMOUS_ACCESS,
      ),
    ).resolves.toMatchObject({
      kind: "rejected",
      error: { kind: "capability_scope_required", action: "update" },
    })
  })

  it("admits staff independently of anonymous capability and redacts the audited read", async () => {
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("staff_anonymous_read"),
        target: { kind: "product", productId: "prod_owned_1" },
        selection: { travelers: [{ firstName: "Ada" }] },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    await expect(
      harness.module.resumeSession(created.session.id, {
        actorKind: "staff",
        principalId: "staff_1",
      }),
    ).resolves.toMatchObject({ kind: "rejected", error: { kind: "not_authorized" } })

    const admitted = await harness.module.resumeSession(created.session.id, {
      actorKind: "staff",
      principalId: "staff_1",
      staffAuthority: { admitted: true, reason: "support_case_123" },
    })
    expect(admitted).toMatchObject({
      kind: "session_resumed",
      session: { redaction: "selection_omitted" },
    })
    if (admitted.kind !== "session_resumed") throw new Error("session not resumed")
    expect(admitted.session).not.toHaveProperty("selection")
    expect([...harness.repository.auditEvents.values()]).toContainEqual(
      expect.objectContaining({
        action: "read",
        actorKind: "staff",
        principalId: "staff_1",
        authorityReason: "support_case_123",
        metadata: { redaction: "selection_omitted" },
      }),
    )
  })

  it("adopts once under a customer race and revokes anonymous access", async () => {
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("adoption_race"),
        target: { kind: "product", productId: "prod_owned_1" },
        selection: { travelers: [{ firstName: "Ada" }] },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    const [first, second] = await Promise.all([
      harness.module.adoptSession(
        created.session.id,
        { expectedRevision: 1, idempotencyKey: "adopt_customer_one" },
        {
          actorKind: "customer",
          principalId: "customer_1",
          capability: TEST_CAPABILITY,
          ...STOREFRONT_ACCESS,
        },
      ),
      harness.module.adoptSession(
        created.session.id,
        { expectedRevision: 1, idempotencyKey: "adopt_customer_two" },
        {
          actorKind: "customer",
          principalId: "customer_2",
          capability: TEST_CAPABILITY,
          ...STOREFRONT_ACCESS,
        },
      ),
    ])

    expect([first.kind, second.kind].sort()).toEqual(["rejected", "session_adopted"])
    const winningPrincipal = first.kind === "session_adopted" ? "customer_1" : "customer_2"
    expect(harness.repository.sessions.get(created.session.id)).toMatchObject({
      actorKind: "customer",
      ownerPrincipalId: winningPrincipal,
      storefrontOrigin: STOREFRONT_ACCESS.storefront,
      capabilityHash: undefined,
      capabilityScopes: [],
      revision: 2,
    })
    await expect(
      harness.module.resumeSession(created.session.id, ANONYMOUS_ACCESS),
    ).resolves.toMatchObject({ kind: "rejected", error: { kind: "not_authorized" } })
    await expect(
      harness.module.resumeSession(created.session.id, {
        actorKind: "customer",
        principalId: winningPrincipal,
        ...STOREFRONT_ACCESS,
      }),
    ).resolves.toMatchObject({
      kind: "session_resumed",
      session: { redaction: "none", selection: { travelers: [{ firstName: "Ada" }] } },
    })
    expect(
      [...harness.repository.auditEvents.values()].filter((event) => event.action === "adopt"),
    ).toHaveLength(1)
  })

  it("renews within policy while explicitly invalidating Quote and Hold authority", async () => {
    const harness = createHarness({
      maxRenewalExtensionMs: 60_000,
      maxSessionLifetimeMs: 120_000,
      sessionTtlMs: 60_000,
    })
    const { session, capability, quote, hold } = await createQuoteAndHold(harness)

    const renewed = await harness.module.renewSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "renew_once", extendBySeconds: 30 },
      { ...ANONYMOUS_ACCESS, capability },
    )
    expect(renewed).toMatchObject({ kind: "session_renewed", session: { revision: 2 } })
    expect(harness.repository.quotes.get(quote.id)?.state).toBe("superseded")
    expect(harness.repository.holds.get(hold.id)?.state).toBe("released")
    expect(harness.inventory.hasActiveHold(hold.id)).toBe(false)

    await expect(
      harness.module.renewSession(
        session.id,
        { expectedRevision: 2, idempotencyKey: "renew_too_far", extendBySeconds: 61 },
        { ...ANONYMOUS_ACCESS, capability },
      ),
    ).resolves.toMatchObject({
      kind: "rejected",
      error: { kind: "renewal_not_allowed", reason: "extension_too_large" },
    })
  })

  it("expires synchronously and purges PII while retaining minimal audit", async () => {
    const harness = createHarness({ sessionTtlMs: 1_000 })
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("expire_and_purge"),
        target: { kind: "product", productId: "prod_owned_1" },
        selection: { travelers: [{ firstName: "Ada", email: "ada@example.test" }] },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const createdRecord = harness.repository.sessions.get(created.session.id)
    expect(createdRecord?.createIdempotencyKey).toMatch(/^[a-f0-9]{64}$/)
    expect(createdRecord?.createRequestFingerprint).toMatch(/^[a-f0-9]{64}$/)

    const customerAccess = {
      actorKind: "customer" as const,
      principalId: "customer_purge_1",
      capability: TEST_CAPABILITY,
      ...STOREFRONT_ACCESS,
    }
    await expect(
      harness.module.adoptSession(
        created.session.id,
        {
          idempotencyKey: "adopt_pii_before_purge",
          expectedRevision: 1,
        },
        customerAccess,
      ),
    ).resolves.toMatchObject({ kind: "session_adopted" })
    expect(JSON.stringify([...harness.repository.operations.values()])).toContain(
      "ada@example.test",
    )
    harness.advance(1_001)

    await expect(
      harness.module.resumeSession(created.session.id, customerAccess),
    ).resolves.toMatchObject({
      kind: "session_resumed",
      session: { state: "expired", revision: 3 },
    })
    await expect(
      harness.module.purgeTerminalSessions(
        { before: new Date("2026-08-01T13:00:00.000Z"), limit: 10 },
        {
          actorKind: "staff",
          principalId: "staff_1",
          staffAuthority: { admitted: true, reason: "retention_policy" },
        },
      ),
    ).resolves.toEqual({ purged: 1 })

    expect(harness.repository.sessions.get(created.session.id)).toMatchObject({
      capabilityHash: undefined,
      capabilityScopes: [],
      ownerPrincipalId: undefined,
      ownerOrganizationId: undefined,
      storefrontOrigin: undefined,
      revision: 4,
      purgedAt: expect.any(Date),
    })
    const purgedRecord = harness.repository.sessions.get(created.session.id)
    expect(purgedRecord?.statePayload).toEqual({})
    expect(purgedRecord?.createIdempotencyKey).toMatch(/^[a-f0-9]{64}$/)
    expect(purgedRecord?.createIdempotencyKey).not.toBe(createdRecord?.createIdempotencyKey)
    expect(purgedRecord?.createRequestFingerprint).toBe(purgedRecord?.createIdempotencyKey)
    expect(
      [...harness.repository.operations.values()].filter(
        (operation) => operation.sessionId === created.session.id,
      ),
    ).toEqual([])
    expect([...harness.repository.auditEvents.values()].map((event) => event.action)).toEqual([
      "adopt",
      "expire",
      "read",
      "purge",
    ])
    expect(JSON.stringify([...harness.repository.auditEvents.values()])).not.toContain("sf_public")
    expect(JSON.stringify([...harness.repository.auditEvents.values()])).not.toContain(
      "chan_public",
    )
  })

  it("purges customer ownership links from the terminal aggregate", async () => {
    const harness = createHarness()
    const customerAccess = {
      actorKind: "customer" as const,
      principalId: "customer_1",
      organizationId: "org_1",
      ...STOREFRONT_ACCESS,
    }
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("purge_customer_owner"),
        target: { kind: "product", productId: "prod_owned_1" },
        selection: { travelers: [{ firstName: "Ada" }] },
      },
      customerAccess,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    await harness.module.abandonSession(
      created.session.id,
      { idempotencyKey: "abandon_customer_for_purge", expectedRevision: 1 },
      customerAccess,
    )

    await expect(
      harness.module.purgeTerminalSessions(
        { before: new Date("2026-08-01T13:00:00.000Z"), limit: 10 },
        {
          actorKind: "staff",
          principalId: "staff_1",
          staffAuthority: { admitted: true, reason: "retention_policy" },
        },
      ),
    ).resolves.toEqual({ purged: 1 })

    expect(harness.repository.sessions.get(created.session.id)).toMatchObject({
      statePayload: {},
      ownerPrincipalId: undefined,
      ownerOrganizationId: undefined,
      storefrontOrigin: undefined,
      purgedAt: expect.any(Date),
    })
  })
})

describe("Booking Session v1 sourced continuation", () => {
  it("retains an admitted supplier-first Commit beyond Session and Quote expiry", async () => {
    let currentNow = new Date("2026-08-02T10:00:00.000Z")
    let commitCalls = 0
    let supplierIntentActive = false
    const repository = createInMemoryBookingSessionRepository()
    const module = createBookingSessionModule({
      now: () => currentNow,
      sessionTtlMs: 1_000,
      quoteTtlMs: 1_000,
      ports: {
        repository,
        normalizeSelection: async ({ selection }) => selection,
        composeRequirements: async () => ({
          status: "available",
          requirements: inMemoryBookingRequirements(),
        }),
        composeQuote: async () => ({
          status: "quoted",
          requirements: inMemoryBookingRequirements(),
          pricing: BASE_PRICING,
        }),
        placeCapacityHold: async () => "unavailable",
        releaseCapacityHold: async () => {},
        commitOwnedBooking: async () => {
          throw new Error("owned commit must not run")
        },
        hasActiveSupplierOperation: async () => supplierIntentActive,
        commitSourcedBooking: async (input) => {
          commitCalls += 1
          if (commitCalls === 1) {
            supplierIntentActive = true
            const persisted = await repository.getSession(input.session.id)
            if (!persisted) throw new Error("session missing")
            persisted.state = "supplier_pending"
            persisted.updatedAt = input.now
            await repository.saveSession(persisted)
            return {
              kind: "supplier_pending",
              nextAction: "await_supplier_operation",
              supplierOperationId: "suop_pending",
              operatorBackedRiskAccepted: false,
            }
          }
          await input.consumeSources({}, "book_sourced", [], "suop_pending")
          return {
            kind: "committed",
            bookingId: "book_sourced",
            allocationIds: [],
            supplierOperationId: "suop_pending",
          }
        },
      },
    })
    const created = await module.createSession(
      {
        idempotencyKey: nextCreateKey("create_sourced"),
        target: { kind: "catalog_item", catalogItemId: "crus_sourced" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_sourced" },
      ANONYMOUS_ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    const commit = {
      expectedRevision: created.session.revision,
      quoteId: quoted.quote.id,
      requirementsFingerprint: quoted.quote.requirementsFingerprint,
      idempotencyKey: "commit_sourced",
    }

    await expect(
      module.commitSession(created.session.id, commit, ANONYMOUS_ACCESS),
    ).resolves.toMatchObject({
      kind: "commit_result",
      outcome: { kind: "supplier_pending", supplierOperationId: "suop_pending" },
    })
    currentNow = new Date("2026-08-02T10:10:00.000Z")
    await expect(
      module.commitSession(created.session.id, commit, ANONYMOUS_ACCESS),
    ).resolves.toMatchObject({
      kind: "commit_result",
      outcome: {
        kind: "committed",
        booking: { id: "book_sourced" },
        supplierOperationId: "suop_pending",
      },
    })
    expect(commitCalls).toBe(2)
  })
})

/**
 * A per-person product that also sells optional units — the exact shape that
 * was unbookable for nine days in voyant#4113. The descriptor publishes a
 * product option carrying person-priced units, a required departure, and the
 * occupancy bands. It deliberately does NOT publish an `option-units` sub-step:
 * the units are optional, and a booking of this product is complete without
 * one. Anything that demanded a unit pick here would make 13 of 39 options
 * unbookable all over again.
 */
function perPersonProductRequirements(): BookingRequirementsV1 {
  const bands = [
    { code: "adult", label: "Adult", minCount: 1, maxCount: 8 },
    { code: "child", label: "Child", minCount: 0, maxCount: 6 },
  ]
  return {
    ...inMemoryBookingRequirements(),
    paxBands: bands,
    paxBandsAllowedTotal: { min: 1, max: 8 },
    travelerFields: [
      { key: "firstName", label: "First name", type: "text", required: true },
      { key: "lastName", label: "Last name", type: "text", required: true },
    ],
    bookingFields: [
      { key: "buyerType", label: "Buyer type", type: "select", required: true, group: "billing" },
    ],
    configureSubSteps: [
      {
        kind: "product-option",
        options: [
          {
            id: "opt_guided",
            name: "Guided departure",
            units: [
              { id: "unit_adult", name: "Adult seat", unitType: "person" },
              { id: "unit_lunch", name: "Lunch", unitType: "service" },
            ],
          },
        ],
      },
      { kind: "departure", required: true },
      { kind: "occupancy", bands },
    ],
  }
}

const SATISFYING_SELECTION = {
  configure: { pax: { adult: 2 }, departureSlotId: "slot_1", variantId: "opt_guided" },
  billing: { buyerType: "B2C" },
  travelers: [
    { firstName: "Ada", lastName: "Lovelace", band: "adult" },
    { firstName: "Grace", lastName: "Hopper", band: "adult" },
  ],
}

describe("Booking Session v1 requirements enforcement", () => {
  async function prepare(selection: Record<string, unknown>) {
    const harness = createHarness({}, undefined, undefined, perPersonProductRequirements())
    // These selections are for two adults, and a Hold now asks for the seats
    // the party actually needs. The shared default of one seat used to be
    // enough only because the Hold was quietly for one person (voyant#4655).
    harness.inventory.setCapacity("product:prod_owned_1", 2)
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("create_requirements"),
        target: { kind: "product", productId: "prod_owned_1" },
        selection,
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    return { harness, session: created.session }
  }

  it("quotes and commits a per-person product configured only through the published requirements", async () => {
    const { harness, session } = await prepare(SATISFYING_SELECTION)

    const quoted = await harness.module.quoteSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "quote_4113" },
      ANONYMOUS_ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error(`quote not created: ${quoted.kind}`)
    const held = await harness.module.placeHold(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quoted.quote.id,
        idempotencyKey: "hold_4113",
      },
      ANONYMOUS_ACCESS,
    )
    if (held.kind !== "hold_created") throw new Error("hold not created")

    const committed = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quoted.quote.id,
        requirementsFingerprint: quoted.quote.requirementsFingerprint,
        holdId: held.hold.id,
        idempotencyKey: "commit_4113",
      },
      ANONYMOUS_ACCESS,
    )

    expect(committed).toMatchObject({ kind: "commit_result", outcome: { kind: "committed" } })
    expect(harness.inventory.bookingIds).toHaveLength(1)
  })

  it("names every unsatisfied requirement at quote time instead of pricing an incomplete selection", async () => {
    const { harness, session } = await prepare({ configure: { pax: {} } })

    const quoted = await harness.module.quoteSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "quote_incomplete" },
      ANONYMOUS_ACCESS,
    )

    expect(quoted).toEqual({
      kind: "rejected",
      error: {
        kind: "selection_incomplete",
        nextAction: "update_selection",
        unsatisfied: [
          { requirementKey: "paxBands.adult", reason: "pax_band_below_min" },
          { requirementKey: "paxBandsAllowedTotal", reason: "pax_total_below_min" },
          { requirementKey: "configureSubSteps.departure", reason: "departure_required" },
          { requirementKey: "configureSubSteps.occupancy", reason: "occupancy_required" },
          { requirementKey: "bookingFields.buyerType", reason: "booking_field_required" },
        ],
      },
    })
    expect(harness.repository.quotes.size).toBe(0)
  })

  it("refuses to commit when the selection stopped satisfying the descriptor after the Quote", async () => {
    const { harness, session } = await prepare(SATISFYING_SELECTION)
    const quoted = await harness.module.quoteSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "quote_drifted" },
      ANONYMOUS_ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    const held = await harness.module.placeHold(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quoted.quote.id,
        idempotencyKey: "hold_drifted",
      },
      ANONYMOUS_ACCESS,
    )
    if (held.kind !== "hold_created") throw new Error("hold not created")
    // The Session's own selection is rewritten underneath the Quote, the way a
    // second tab or a stale client would do it.
    const stored = harness.repository.sessions.get(session.id)
    if (!stored) throw new Error("session not stored")
    stored.statePayload = { configure: { pax: {} } }

    const committed = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quoted.quote.id,
        requirementsFingerprint: quoted.quote.requirementsFingerprint,
        holdId: held.hold.id,
        idempotencyKey: "commit_drifted",
      },
      ANONYMOUS_ACCESS,
    )

    expect(committed).toMatchObject({
      kind: "rejected",
      error: { kind: "selection_incomplete", nextAction: "update_selection" },
    })
    expect(harness.inventory.bookingIds).toEqual([])
    expect(harness.repository.commits.size).toBe(0)
  })

  it("rejects a Commit collected against a descriptor the server has since changed", async () => {
    const { harness, session } = await prepare(SATISFYING_SELECTION)
    const quoted = await harness.module.quoteSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "quote_changed" },
      ANONYMOUS_ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    const held = await harness.module.placeHold(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quoted.quote.id,
        idempotencyKey: "hold_changed",
      },
      ANONYMOUS_ACCESS,
    )
    if (held.kind !== "hold_created") throw new Error("hold not created")
    harness.setRequirements({
      ...perPersonProductRequirements(),
      travelerFields: [
        { key: "firstName", label: "First name", type: "text", required: true },
        { key: "lastName", label: "Last name", type: "text", required: true },
        { key: "passport", label: "Passport", type: "text", required: true },
      ],
    })

    const committed = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quoted.quote.id,
        requirementsFingerprint: quoted.quote.requirementsFingerprint,
        holdId: held.hold.id,
        idempotencyKey: "commit_changed",
      },
      ANONYMOUS_ACCESS,
    )

    expect(committed).toMatchObject({
      kind: "rejected",
      error: { kind: "requirements_changed", nextAction: "request_fresh_quote" },
    })
    expect(harness.inventory.bookingIds).toEqual([])
  })

  it("rejects a Commit that echoes a requirements fingerprint it never quoted", async () => {
    const { harness, session } = await prepare(SATISFYING_SELECTION)
    const quoted = await harness.module.quoteSession(
      session.id,
      { expectedRevision: session.revision, idempotencyKey: "quote_echo" },
      ANONYMOUS_ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    const held = await harness.module.placeHold(
      session.id,
      { expectedRevision: session.revision, quoteId: quoted.quote.id, idempotencyKey: "hold_echo" },
      ANONYMOUS_ACCESS,
    )
    if (held.kind !== "hold_created") throw new Error("hold not created")

    const committed = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quoted.quote.id,
        requirementsFingerprint: "a-descriptor-the-server-never-published",
        holdId: held.hold.id,
        idempotencyKey: "commit_echo",
      },
      ANONYMOUS_ACCESS,
    )

    expect(committed).toMatchObject({
      kind: "rejected",
      error: {
        kind: "requirements_changed",
        requirementsFingerprint: quoted.quote.requirementsFingerprint,
      },
    })
    expect(harness.inventory.bookingIds).toEqual([])
  })
})

function createPaymentHarness() {
  const transfers: Array<{
    tx: unknown
    paymentSessionId: string
    bookingSessionId: string
    bookingId: string
  }> = []
  const expirations: Array<{ tx: unknown; bookingSessionId: string; at: Date }> = []
  const harness = {
    /**
     * `true` for a payment that records nothing about what it was collected
     * for — the pre-voyant#4636 shape, which settlement still supports by
     * falling back to the Session's single active Quote. The object form is
     * what production writes.
     */
    established: false as boolean | { quoteId: string | null; holdId: string | null },
    inFlight: false,
    prepareCalls: 0,
    transfers,
    expirations,
    ports: undefined as unknown as BookingSessionPaymentPorts,
  }
  harness.ports = {
    async prepare() {
      harness.prepareCalls += 1
      if (harness.established) {
        return { kind: "established", paymentSessionId: "payment_session_1" }
      }
      return {
        kind: "required",
        allowedGuarantees: ["deposit"],
        paymentSession: {
          id: "payment_session_1",
          status: "requires_redirect",
          amountCents: 10_000,
          currency: "EUR",
          redirectUrl: "https://payments.example.test/session/1",
          checkout: { kind: "redirect", url: "https://payments.example.test/session/1" },
          expiresAt: "2026-08-01T12:01:00.000Z",
        },
      }
    },
    async hasInFlight() {
      return harness.inFlight
    },
    async describeEstablished() {
      return typeof harness.established === "object" ? harness.established : null
    },
    async transferToBooking(input) {
      transfers.push(input)
    },
    async expirePending(input) {
      expirations.push(input)
    },
  }
  return harness
}

function createBankTransferHarness() {
  const harness = {
    prepareCalls: 0,
    establishCalls: 0,
    ports: undefined as unknown as BookingSessionPaymentPorts,
  }
  harness.ports = {
    async prepare({ commit }) {
      harness.prepareCalls += 1
      expect(commit.checkoutIntent).toBe("bank_transfer")
      return { kind: "not_required" }
    },
    async establishBankTransfer() {
      harness.establishCalls += 1
      return {
        paymentSessionId: "pays_bank_transfer",
        document: { id: "invc_proforma", number: "PRO-42", type: "proforma" as const },
        instructions: {
          beneficiary: "Voyant Travel",
          iban: "RO49AAAA1B31007593840000",
          bankName: "Voyant Bank",
          reference: "BOOK-42",
          amountCents: 10_000,
          currency: "EUR",
          dueAt: "2026-08-08T12:00:00.000Z",
        },
      }
    },
    async transferToBooking() {},
    async expirePending() {},
  }
  return harness
}

/**
 * voyant#4625 §3 — confirmation, not new behaviour.
 *
 * Under the target model a publishable key may open, quote, hold and commit a
 * Booking Session, because the key is never the authority: the session's own
 * capability, its revision and its idempotency key are. These pin that, so a
 * later change cannot quietly make the credential load-bearing again.
 *
 * Nothing in this suite presents a key of any kind. If any of it started
 * depending on one, the model would have moved.
 */
describe("Booking Session v1 authority under a publishable key", () => {
  it("refuses a session action without the session's own capability", async () => {
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("pk_authority_capability"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    await expect(
      harness.module.resumeSession(created.session.id, {
        actorKind: "anonymous",
        ...STOREFRONT_ACCESS,
      }),
    ).resolves.toMatchObject({ kind: "rejected", error: { kind: "capability_required" } })
  })

  it("refuses a stale revision even with the right capability", async () => {
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("pk_authority_revision"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    await expect(
      harness.module.quoteSession(
        created.session.id,
        {
          expectedRevision: created.session.revision + 5,
          idempotencyKey: "pk_authority_stale_revision",
        },
        ANONYMOUS_ACCESS,
      ),
    ).resolves.toMatchObject({ kind: "rejected" })
  })

  it("replays a repeated idempotency key instead of acting twice", async () => {
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("pk_authority_idempotency"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    const first = await harness.module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "pk_authority_quote_once" },
      ANONYMOUS_ACCESS,
    )
    const replay = await harness.module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "pk_authority_quote_once" },
      ANONYMOUS_ACCESS,
    )

    expect(first.kind).not.toBe("rejected")
    expect(replay).toEqual(first)
  })

  it("pins the session to the storefront that opened it", async () => {
    // Origin binding is a browser control, so the session carries its own
    // storefront provenance rather than trusting the request's.
    const harness = createHarness()
    const created = await harness.module.createSession(
      {
        idempotencyKey: nextCreateKey("pk_authority_storefront"),
        target: { kind: "product", productId: "prod_owned_1" },
      },
      ANONYMOUS_ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")

    await expect(
      harness.module.resumeSession(created.session.id, {
        actorKind: "anonymous",
        capability: TEST_CAPABILITY,
        storefront: { storefrontId: "sf_other", channelId: "chan_other" },
      }),
    ).resolves.toMatchObject({ kind: "rejected", error: { kind: "not_authorized" } })
  })
})

function nextCreateKey(prefix: string): string {
  createCounter += 1
  return `${prefix}_${createCounter}`
}
