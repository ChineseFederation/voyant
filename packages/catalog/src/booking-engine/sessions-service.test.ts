import {
  assertBookingLifecycleConformanceV1,
  bookingLifecycleConformanceScenariosV1,
} from "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance"
import { describe, expect, it } from "vitest"

import {
  createInMemoryBookingSessionRepository,
  createInMemoryOwnedInventoryPorts,
} from "./sessions-memory.js"
import { createBookingSessionModule } from "./sessions-service.js"

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

const ANONYMOUS_ACCESS = { actorKind: "anonymous" as const }
let createCounter = 0

function createHarness(
  ttl: { sessionTtlMs?: number; quoteTtlMs?: number; holdTtlMs?: number } = {},
) {
  let currentNow = new Date("2026-08-01T12:00:00.000Z")
  let price = BASE_PRICING
  const repository = createInMemoryBookingSessionRepository()
  const inventory = createInMemoryOwnedInventoryPorts()
  inventory.setCapacity("product:prod_owned_1", 1)
  const module = createBookingSessionModule({
    now: () => currentNow,
    ...(ttl.sessionTtlMs == null ? {} : { sessionTtlMs: ttl.sessionTtlMs }),
    quoteTtlMs: ttl.quoteTtlMs ?? 5 * 60_000,
    holdTtlMs: ttl.holdTtlMs ?? 60_000,
    ports: {
      repository,
      normalizeSelection: async ({ selection }) => selection,
      composeQuote: async () => ({ status: "quoted", pricing: price }),
      placeCapacityHold: inventory.placeCapacityHold,
      releaseCapacityHold: inventory.releaseCapacityHold,
      commitOwnedBooking: inventory.commitOwnedBooking,
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
    { ...ANONYMOUS_ACCESS, capability: created.capability?.token },
  )
  if (quoted.kind !== "quote_created") throw new Error("quote not created")
  const held = await harness.module.placeHold(
    created.session.id,
    {
      expectedRevision: created.session.revision,
      quoteId: quoted.quote.id,
      idempotencyKey: "hold_key",
    },
    { ...ANONYMOUS_ACCESS, capability: created.capability?.token },
  )
  if (held.kind !== "hold_created") throw new Error("hold not created")
  return {
    harness,
    session: created.session,
    capability: created.capability?.token,
    quote: quoted.quote,
    hold: held.hold,
  }
}

describe("Booking Session v1 owned tracer", () => {
  it("requires the returned anonymous Session capability before mutation", async () => {
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
      ANONYMOUS_ACCESS,
    )

    expect(rejected).toMatchObject({
      kind: "rejected",
      error: { kind: "capability_required" },
    })
    expect(harness.repository.quotes.size).toBe(0)
  })

  it("replays or rejects create idempotency before creating duplicate Sessions", async () => {
    const harness = createHarness()
    const input = {
      idempotencyKey: "create_idem_key",
      target: { kind: "product" as const, productId: "prod_owned_1" },
      selection: { departureSlotId: "slot_one" },
    }
    const createAccess = { ...ANONYMOUS_ACCESS, capability: "bcap_client_create_recovery" }

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

  it("creates no Booking or Allocation residue before Commit, then commits exactly once", async () => {
    const { harness, session, capability, quote, hold } = await createQuoteAndHold()

    expect(harness.inventory.bookingIds).toEqual([])
    expect(harness.inventory.allocationIds).toEqual([])

    const committed = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
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

  it("checks Hold expiry synchronously at Commit", async () => {
    const { harness, session, capability, quote, hold } = await createQuoteAndHold()
    harness.advance(61_000)

    const rejected = await harness.module.commitSession(
      session.id,
      {
        expectedRevision: session.revision,
        quoteId: quote.id,
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

  it("replays a stable idempotency key without creating another Booking", async () => {
    const { harness, session, capability, quote, hold } = await createQuoteAndHold()
    const input = {
      expectedRevision: session.revision,
      quoteId: quote.id,
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
      { ...ANONYMOUS_ACCESS, capability: created.capability?.token },
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")

    const secondHold = await harness.module.placeHold(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: quoted.quote.id,
        idempotencyKey: "hold_b",
      },
      { ...ANONYMOUS_ACCESS, capability: created.capability?.token },
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
      { ...ANONYMOUS_ACCESS, capability: first.capability?.token },
    )
    const secondQuote = await harness.module.quoteSession(
      second.session.id,
      { expectedRevision: second.session.revision, idempotencyKey: "last_seat_quote_b" },
      { ...ANONYMOUS_ACCESS, capability: second.capability?.token },
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
        { ...ANONYMOUS_ACCESS, capability: first.capability?.token },
      ),
      harness.module.placeHold(
        second.session.id,
        {
          expectedRevision: second.session.revision,
          quoteId: secondQuote.quote.id,
          idempotencyKey: "last_seat_hold_b",
        },
        { ...ANONYMOUS_ACCESS, capability: second.capability?.token },
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
        composeQuote: async () => ({ status: "quoted", pricing: BASE_PRICING }),
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
      setPrice() {},
    }
    const { session, capability, quote, hold } = await createQuoteAndHold(harness)

    await expect(
      module.commitSession(
        session.id,
        {
          expectedRevision: session.revision,
          quoteId: quote.id,
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
})

function nextCreateKey(prefix: string): string {
  createCounter += 1
  return `${prefix}_${createCounter}`
}
