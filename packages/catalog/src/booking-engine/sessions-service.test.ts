import {
  assertBookingLifecycleConformanceV1,
  bookingLifecycleConformanceScenariosV1,
} from "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance"
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
        pricing: price,
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
    }

    const first = await harness.module.commitSession(session.id, input, ANONYMOUS_ACCESS)
    const retry = await harness.module.commitSession(session.id, input, ANONYMOUS_ACCESS)

    expect(first).toMatchObject({
      kind: "commit_result",
      outcome: {
        kind: "payment_required",
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

  it("seeds exactly one Trip Snapshot Session with accepted Proposal Version provenance", async () => {
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
        target: {
          kind: "trip_snapshot",
          tripSnapshotId: "trsn_frozen",
          tripEnvelopeId: "trip_composed",
        },
        origin: {
          kind: "accepted_proposal_version",
          proposalId: "prps_accepted",
          proposalVersionId: "prvr_accepted",
          tripSnapshotId: "trsn_frozen",
        },
      },
    })
    expect(replay).toEqual(first)
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
    established: false,
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
    async transferToBooking(input) {
      transfers.push(input)
    },
    async expirePending(input) {
      expirations.push(input)
    },
  }
  return harness
}

function nextCreateKey(prefix: string): string {
  createCounter += 1
  return `${prefix}_${createCounter}`
}
