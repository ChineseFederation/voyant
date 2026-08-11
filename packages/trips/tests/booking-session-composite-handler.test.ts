// agent-quality: file-size exception -- owner: trips; this suite exercises the aggregate composite lifecycle through one shared snapshot harness.
import type {
  BookingHoldInternalRecord,
  BookingQuoteInternalRecord,
  BookingRequirementsV1,
  BookingSessionCompositeLeafRuntime,
  BookingSessionInternalRecord,
  PricingBreakdownV1,
} from "@voyant-travel/catalog/booking-engine"
import {
  DEFAULT_PAX_BANDS,
  DEFAULT_PAYMENT_INTENTS,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  paxBandsAllowedTotalFrom,
} from "@voyant-travel/catalog-contracts/booking-engine/requirements-defaults"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import {
  createTripBookingSessionCompositeHandler,
  type TripBookingSessionCompositePersistence,
} from "../src/booking-session-composite-handler.js"
import type { TripComponent, TripSnapshot } from "../src/schema.js"

const NOW = new Date("2026-08-02T10:00:00.000Z")
const LEAF_REQUIREMENTS = {
  ...defaultRequirementsFlags(),
  paxBands: [...DEFAULT_PAX_BANDS],
  paxBandsAllowedTotal: paxBandsAllowedTotalFrom(DEFAULT_PAX_BANDS),
  travelerFields: [...defaultTravelerFields()],
  bookingFields: [...defaultBookingFields()],
  paymentIntents: [...DEFAULT_PAYMENT_INTENTS],
} as BookingRequirementsV1
const ACCESS = {
  actorKind: "staff" as const,
  principalId: "staff_1",
  staffAuthority: { admitted: true, reason: "golden_flow" },
}

describe("accepted Proposal Version Booking Session composite", () => {
  it("freshly quotes, holds, and commits all-live components exactly once", async () => {
    const first = component({ id: "tcmp_tour", entityId: "prod_tour" })
    const second = component({
      id: "tcmp_transfer",
      entityModule: "accommodations",
      entityId: "acco_transfer",
      sequence: 1,
    })
    const state = harness([first, second])
    const commitOwned = vi.fn(async (input) => {
      const id = entityId(input.session)
      const bookingId = id === "prod_tour" ? "book_tour" : "book_transfer"
      const allocationIds = id === "prod_tour" ? ["ball_tour"] : ["ball_transfer"]
      await input.consumeSources(state.db, bookingId, allocationIds)
      return { bookingId, allocationIds }
    })
    const placeCapacityHold = vi.fn(async () => "held" as const)
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const leaf = leafRuntime({ commitOwned, placeCapacityHold })

    const quote = await createQuote(handler, state.session, leaf, state.db)
    expect(quote.pricing).toMatchObject({ subtotal: 20_000, taxTotal: 2_000, total: 22_000 })
    expect(quote.pricing.lines.map((line) => line.componentId)).toEqual([
      "tcmp_tour",
      "tcmp_transfer",
    ])

    await expect(
      handler.placeCapacityHold({
        session: state.session,
        quote,
        holdId: "bshd_aggregate",
        capacityKey: "trip_snapshot:trsn_1",
        quantity: 1,
        expiresAt: new Date("2026-08-02T10:15:00.000Z"),
        access: ACCESS,
        now: NOW,
        tx: state.db,
        leaf,
      }),
    ).resolves.toBe("held")
    expect(placeCapacityHold).toHaveBeenCalledTimes(2)

    const hold = aggregateHold(state.session, quote)
    const consumeSources = vi.fn(async () => {})
    const firstCommit = await handler.commit({
      session: state.session,
      quote,
      hold,
      idempotencyKey: "commit_accepted_proposal",
      requestFingerprint: "fp_accepted_proposal",
      access: ACCESS,
      now: NOW,
      consumeSources,
      leaf,
      db: state.db,
    })
    expect(firstCommit).toEqual({
      kind: "committed",
      bookings: [
        { componentId: "tcmp_tour", bookingId: "book_tour", allocationIds: ["ball_tour"] },
        {
          componentId: "tcmp_transfer",
          bookingId: "book_transfer",
          allocationIds: ["ball_transfer"],
        },
      ],
    })

    await expect(
      handler.commit({
        session: state.session,
        quote,
        hold,
        idempotencyKey: "commit_accepted_proposal",
        requestFingerprint: "fp_accepted_proposal",
        access: ACCESS,
        now: NOW,
        consumeSources,
        leaf,
        db: state.db,
      }),
    ).resolves.toEqual(firstCommit)
    expect(commitOwned).toHaveBeenCalledTimes(2)
    expect(consumeSources).toHaveBeenCalledTimes(2)
  })

  it("quotes and commits a redeemed package through the sourced supplier-operation leaf", async () => {
    const selectedPackage = component({
      sourceKind: "voyant-connect",
      sourceConnectionId: "connection_server",
      sourceRef: "product_1",
      metadata: {
        sourceProvider: "tui",
        bookingDraftV1: {
          entity: {
            module: "products",
            id: "prod_1",
            sourceKind: "voyant-connect",
            sourceConnectionId: "connection_server",
            sourceRef: "product_1",
          },
          configure: {
            departureDate: "2026-09-10",
            departureAirportCode: "OTP",
            nights: 5,
            pax: { adult: 2 },
            roomTypeId: "room_1",
            ratePlanId: "rate_1:AI",
            board: "AI",
          },
        },
      },
    })
    const state = harness([selectedPackage])
    const commitSourced = vi.fn(async (input) => {
      expect(input.session.target).toEqual({ kind: "catalog_item", catalogItemId: "prod_1" })
      expect(input.session.sourcedTargetPin).toEqual({
        entityModule: "products",
        entityId: "prod_1",
        sourceKind: "voyant-connect",
        sourceProvider: "tui",
        sourceConnectionId: "connection_server",
        sourceRef: "product_1",
        projection: { title: "Live component", description: "Live component" },
        title: "Live component",
      })
      expect(input.session.statePayload).toMatchObject({
        configure: {
          departureDate: "2026-09-10",
          departureAirportCode: "OTP",
          roomTypeId: "room_1",
          ratePlanId: "rate_1:AI",
          board: "AI",
        },
      })
      await input.consumeSources(state.db, "book_package", ["ball_package"], "suop_package")
      return {
        kind: "committed" as const,
        bookingId: "book_package",
        allocationIds: ["ball_package"],
        supplierOperationId: "suop_package",
      }
    })
    const leaf = leafRuntime({ commitSourced })
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const quote = await createQuote(handler, state.session, leaf, state.db)

    await expect(
      handler.placeCapacityHold({
        session: state.session,
        quote,
        holdId: "bshd_package",
        capacityKey: "trip_snapshot:trsn_1",
        quantity: 1,
        expiresAt: new Date("2026-08-02T10:15:00.000Z"),
        access: ACCESS,
        now: NOW,
        tx: state.db,
        leaf,
      }),
    ).resolves.toBe("held")

    await expect(
      handler.commit({
        session: state.session,
        quote,
        idempotencyKey: "commit_package",
        requestFingerprint: "fp_package",
        access: ACCESS,
        now: NOW,
        consumeSources: async () => {},
        leaf,
        db: state.db,
      }),
    ).resolves.toEqual({
      kind: "committed",
      bookings: [
        {
          componentId: selectedPackage.id,
          bookingId: "book_package",
          allocationIds: ["ball_package"],
          supplierOperationId: "suop_package",
        },
      ],
    })
    expect(commitSourced).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierOperationScope: selectedPackage.id,
        idempotencyKey: `commit_package:${selectedPackage.id}`,
      }),
    )
  })

  it("commits a customer-built Trip without an accepted Proposal origin", async () => {
    const selectedPackage = component({
      sourceKind: "voyant-connect",
      sourceConnectionId: "connection_server",
      sourceRef: "product_1",
    })
    const state = harness([selectedPackage])
    state.session.origin = undefined
    state.session.actorKind = "customer"
    state.session.ownerPrincipalId = undefined
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const leaf = leafRuntime()
    const quote = await createQuote(handler, state.session, leaf, state.db)

    await expect(
      handler.commit({
        session: state.session,
        quote,
        idempotencyKey: "commit_customer_trip",
        requestFingerprint: "fp_customer_trip",
        access: ACCESS,
        now: NOW,
        consumeSources: async () => {},
        leaf,
        db: state.db,
      }),
    ).resolves.toMatchObject({ kind: "committed" })
  })

  it("commits an originless customer Trip against its accepted fresh quote", async () => {
    const state = harness([component()])
    state.session.origin = undefined
    state.session.actorKind = "customer"
    state.session.ownerPrincipalId = undefined
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const quote = await createQuote(
      handler,
      state.session,
      leafRuntime({ quoteTotal: 12_000 }),
      state.db,
    )

    await expect(
      handler.commit({
        session: state.session,
        quote,
        hold: aggregateHold(state.session, quote),
        idempotencyKey: "commit_customer_changed_price",
        requestFingerprint: "fp_customer_changed_price",
        access: ACCESS,
        now: NOW,
        consumeSources: async () => {},
        leaf: leafRuntime({ quoteTotal: 12_000 }),
        db: state.db,
      }),
    ).resolves.toMatchObject({ kind: "committed" })
  })

  it("keeps an ambiguous package confirmation in doubt without materializing a booking", async () => {
    const selectedPackage = component({
      sourceKind: "voyant-connect",
      sourceConnectionId: "connection_server",
      sourceRef: "product_1",
    })
    const state = harness([selectedPackage])
    const consumeSources = vi.fn(async () => {})
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const leaf = leafRuntime({
      commitSourced: vi.fn(async () => ({
        kind: "supplier_in_doubt" as const,
        nextAction: "reconcile_supplier_operation" as const,
        supplierOperationId: "suop_package",
        operatorBackedRiskAccepted: false,
      })),
    })
    const quote = await createQuote(handler, state.session, leaf, state.db)

    await expect(
      handler.commit({
        session: state.session,
        quote,
        idempotencyKey: "commit_package",
        requestFingerprint: "fp_package",
        access: ACCESS,
        now: NOW,
        consumeSources,
        leaf,
        db: state.db,
      }),
    ).resolves.toEqual({
      kind: "component_commit_pending",
      nextAction: "continue_component_commit",
      components: [
        {
          componentId: selectedPackage.id,
          state: "supplier_in_doubt",
          supplierOperationId: "suop_package",
        },
      ],
    })
    expect(consumeSources).not.toHaveBeenCalled()
  })

  it("keeps manual placeholders honest and leaves the aggregate pending", async () => {
    const live = component({ id: "tcmp_cruise", entityId: "crus_1", sourceKind: "direct:cruise" })
    const manual = component({
      id: "tcmp_manual",
      sequence: 1,
      kind: "manual_placeholder",
      entityModule: null,
      entityId: null,
      sourceKind: null,
      description: "Private guide",
    })
    const state = harness([live, manual])
    const markManual = vi.fn(async () => {})
    state.persistence.markManualConfirmationRequired = markManual
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const leaf = leafRuntime({
      commitSourced: vi.fn(async () => ({
        kind: "supplier_pending" as const,
        nextAction: "await_supplier_operation" as const,
        supplierOperationId: "suop_cruise",
        operatorBackedRiskAccepted: false,
      })),
    })

    const quote = await createQuote(handler, state.session, leaf, state.db)
    expect(quote.pricing.lines.find((line) => line.componentId === "tcmp_manual")).toMatchObject({
      authority: "accepted_proposal_manual",
      totalAmount: 10_000,
    })
    await expect(
      handler.commit({
        session: state.session,
        quote,
        idempotencyKey: "commit_mixed",
        requestFingerprint: "fp_mixed",
        access: ACCESS,
        now: NOW,
        consumeSources: async () => {},
        leaf,
        db: state.db,
      }),
    ).resolves.toMatchObject({
      kind: "component_commit_pending",
      components: expect.arrayContaining([
        expect.objectContaining({ componentId: "tcmp_cruise", state: "supplier_pending" }),
        expect.objectContaining({
          componentId: "tcmp_manual",
          state: "manual_confirmation_required",
        }),
      ]),
    })
    expect(markManual).toHaveBeenCalledWith(state.db, manual)
  })

  it("requires renewed acceptance when fresh pricing materially changes", async () => {
    const state = harness([component()])
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const leaf = leafRuntime({ quoteTotal: 12_000 })
    const quote = await createQuote(handler, state.session, leaf, state.db)

    await expect(
      handler.commit({
        session: state.session,
        quote,
        hold: aggregateHold(state.session, quote),
        idempotencyKey: "commit_changed_price",
        requestFingerprint: "fp_changed_price",
        access: ACCESS,
        now: NOW,
        consumeSources: async () => {},
        leaf,
        db: state.db,
      }),
    ).resolves.toEqual({
      kind: "proposal_acceptance_required",
      nextAction: "renew_proposal_version_acceptance",
      proposalVersionId: "prver_1",
    })
  })

  it("detects offsetting component price changes even when the aggregate total is unchanged", async () => {
    const state = harness([
      component({ id: "tcmp_first", entityId: "prod_first" }),
      component({ id: "tcmp_second", entityId: "prod_second", sequence: 1 }),
    ])
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const leaf = leafRuntime()
    leaf.composeQuote = async ({ session }) => ({
      status: "quoted",
      requirements: LEAF_REQUIREMENTS,
      pricing: pricing(entityId(session) === "prod_first" ? 12_000 : 10_000),
    })
    const quote = await createQuote(handler, state.session, leaf, state.db)
    expect(quote.pricing.total).toBe(state.snapshot.totalAmountCents)

    await expect(
      handler.commit({
        session: state.session,
        quote,
        hold: aggregateHold(state.session, quote),
        idempotencyKey: "commit_offsetting_prices",
        requestFingerprint: "fp_offsetting_prices",
        access: ACCESS,
        now: NOW,
        consumeSources: async () => {},
        leaf,
        db: state.db,
      }),
    ).resolves.toMatchObject({ kind: "proposal_acceptance_required" })
  })

  it("requires renewed acceptance when freshly resolved cancellation terms change", async () => {
    const state = harness([
      component({ cancellationSnapshot: { refundable: true, deadlineHours: 48 } }),
    ])
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const leaf = leafRuntime({
      policyEvidence: { cancellation: { refundable: false, deadlineHours: 0 } },
    })
    const quote = await createQuote(handler, state.session, leaf, state.db)

    await expect(
      handler.commit({
        session: state.session,
        quote,
        hold: aggregateHold(state.session, quote),
        idempotencyKey: "commit_changed_policy",
        requestFingerprint: "fp_changed_policy",
        access: ACCESS,
        now: NOW,
        consumeSources: async () => {},
        leaf,
        db: state.db,
      }),
    ).resolves.toMatchObject({
      kind: "proposal_acceptance_required",
      proposalVersionId: "prver_1",
    })
  })

  it("refuses to quote accepted policy terms that the live handler cannot revalidate", async () => {
    const state = harness([component({ cancellationSnapshot: { refundable: true } })])
    const handler = createTripBookingSessionCompositeHandler(state.persistence)

    await expect(
      handler.composeQuote({
        session: state.session,
        now: NOW,
        tx: state.db,
        leaf: leafRuntime(),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      // The trip's own descriptor survives the policy failure so the host
      // still renders the journey it is in.
      requirements: expect.objectContaining({ showsConfigure: false }),
      reason: "policy_unavailable",
      nextAction: "contact_operator",
    })
  })

  it("stops Quote when any live component is unavailable", async () => {
    const state = harness([component()])
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const leaf = leafRuntime({ unavailable: true })

    await expect(
      handler.composeQuote({ session: state.session, now: NOW, tx: state.db, leaf }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "selection_unavailable",
      nextAction: "update_selection",
    })
  })

  it("requires a real aggregate Hold before committing owned capacity", async () => {
    const state = harness([component()])
    const handler = createTripBookingSessionCompositeHandler(state.persistence)
    const leaf = leafRuntime()
    const quote = await createQuote(handler, state.session, leaf, state.db)

    await expect(
      handler.commit({
        session: state.session,
        quote,
        idempotencyKey: "commit_without_hold",
        requestFingerprint: "fp_without_hold",
        access: ACCESS,
        now: NOW,
        consumeSources: async () => {},
        leaf,
        db: state.db,
      }),
    ).resolves.toEqual({
      kind: "hold_failure",
      nextAction: "request_new_hold",
      reason: "missing",
    })
  })
})

function harness(components: TripComponent[]) {
  const snapshot = tripSnapshot(components)
  const allocations = new Map<string, string[]>()
  const db = {
    transaction: async <T>(operation: (tx: unknown) => Promise<T>) => operation({}),
    // agent-quality: unsafe-cast reviewed -- owner: trips; this transaction-only test double deliberately implements the persistence surface used by the handler.
  } as PostgresJsDatabase
  const persistence: TripBookingSessionCompositePersistence = {
    loadSnapshot: async () => snapshot,
    loadCurrentComponents: async () => components,
    loadAllocationIds: async (_db, bookingId) => allocations.get(bookingId) ?? [],
    markManualConfirmationRequired: async () => {},
    recordComponentCommit: async ({ component, commitment }) => {
      component.bookingId = commitment.bookingId
      allocations.set(commitment.bookingId, commitment.allocationIds)
    },
  }
  return { db, persistence, session: bookingSession(), snapshot }
}

function leafRuntime(
  options: {
    quoteTotal?: number
    policyEvidence?: PricingBreakdownV1["policyEvidence"]
    unavailable?: boolean
    placeCapacityHold?: BookingSessionCompositeLeafRuntime["placeCapacityHold"]
    commitOwned?: BookingSessionCompositeLeafRuntime["commitOwned"]
    commitSourced?: BookingSessionCompositeLeafRuntime["commitSourced"]
  } = {},
): BookingSessionCompositeLeafRuntime {
  return {
    composeRequirements: async () =>
      options.unavailable
        ? { status: "unavailable", reason: "selection_unavailable", nextAction: "update_selection" }
        : { status: "available", requirements: LEAF_REQUIREMENTS },
    composeQuote: async () =>
      options.unavailable
        ? { status: "unavailable", reason: "selection_unavailable", nextAction: "update_selection" }
        : {
            status: "quoted",
            requirements: LEAF_REQUIREMENTS,
            pricing: pricing(options.quoteTotal ?? 11_000, options.policyEvidence),
          },
    placeCapacityHold: options.placeCapacityHold ?? (async () => "held"),
    releaseCapacityHold: async () => {},
    commitOwned:
      options.commitOwned ??
      (async (input) => {
        const bookingId = `book_${entityId(input.session)}`
        const allocationIds = [`ball_${entityId(input.session)}`]
        await input.consumeSources({}, bookingId, allocationIds)
        return { bookingId, allocationIds }
      }),
    commitSourced:
      options.commitSourced ??
      (async (input) => {
        const bookingId = `book_${entityId(input.session)}`
        const allocationIds = [`ball_${entityId(input.session)}`]
        const supplierOperationId = `suop_${input.supplierOperationScope}`
        await input.consumeSources({}, bookingId, allocationIds, supplierOperationId)
        return {
          kind: "committed",
          bookingId,
          allocationIds,
          supplierOperationId,
        }
      }),
  }
}

async function createQuote(
  handler: ReturnType<typeof createTripBookingSessionCompositeHandler>,
  session: BookingSessionInternalRecord,
  leaf: BookingSessionCompositeLeafRuntime,
  db: PostgresJsDatabase,
): Promise<BookingQuoteInternalRecord> {
  const result = await handler.composeQuote({ session, now: NOW, tx: db, leaf })
  if (result.status !== "quoted") throw new Error("expected quoted aggregate")
  return {
    id: "bsqu_aggregate",
    sessionId: session.id,
    sessionRevision: session.revision,
    state: "active",
    requirements: result.requirements,
    pricing: result.pricing,
    priceFingerprint: "aggregate_quote",
    requirementsFingerprint: "aggregate_requirements",
    quotedAt: NOW,
    expiresAt: new Date("2026-08-02T10:10:00.000Z"),
  }
}

function aggregateHold(
  session: BookingSessionInternalRecord,
  quote: BookingQuoteInternalRecord,
): BookingHoldInternalRecord {
  return {
    id: "bshd_aggregate",
    sessionId: session.id,
    quoteId: quote.id,
    target: session.target,
    quantity: 1,
    state: "active",
    capacityKey: "trip_snapshot:trsn_1",
    expiresAt: new Date("2026-08-02T10:15:00.000Z"),
    createdAt: NOW,
  }
}

function bookingSession(): BookingSessionInternalRecord {
  return {
    id: "bses_accepted_proposal",
    createIdempotencyKey: "accepted-proposal-version:prver_1",
    createRequestFingerprint: "fp_create",
    capabilityScopes: [],
    target: {
      kind: "trip_snapshot",
      tripSnapshotId: "trsn_1",
      tripEnvelopeId: "trip_1",
    },
    origin: {
      kind: "accepted_proposal_version",
      proposalId: "prop_1",
      proposalVersionId: "prver_1",
      tripSnapshotId: "trsn_1",
    },
    actorKind: "staff",
    ownerPrincipalId: "staff_1",
    scope: { locale: "en", market: "default" },
    state: "active",
    revision: 1,
    statePayload: {
      billing: { personId: "pers_1" },
      travelers: [{ firstName: "Ana", lastName: "Ionescu" }],
    },
    expiresAt: new Date("2026-08-03T10:00:00.000Z"),
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function component(overrides: Partial<TripComponent> = {}): TripComponent {
  return {
    id: "tcmp_product",
    envelopeId: "trip_1",
    sequence: 0,
    kind: "catalog_booking",
    status: "priced",
    title: "Live component",
    description: "Live component",
    entityModule: "products",
    entityId: "prod_1",
    sourceKind: "owned",
    sourceConnectionId: null,
    sourceRef: null,
    bookingDraftId: null,
    catalogQuoteId: "cpr_1",
    bookingId: null,
    bookingGroupId: null,
    orderId: null,
    paymentSessionId: null,
    providerRef: null,
    supplierRef: null,
    componentCurrency: "EUR",
    componentSubtotalAmountCents: 10_000,
    componentTaxAmountCents: 1_000,
    componentTotalAmountCents: 11_000,
    pricingSnapshot: {
      currency: "EUR",
      subtotalAmountCents: 10_000,
      taxAmountCents: 1_000,
      totalAmountCents: 11_000,
    },
    taxLines: [],
    cancellationSnapshot: null,
    holdToken: null,
    holdExpiresAt: null,
    priceExpiresAt: null,
    warningCodes: [],
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function tripSnapshot(components: TripComponent[]): TripSnapshot {
  const lines = components.map((item) => ({
    componentId: item.id,
    sequence: item.sequence,
    kind: item.kind,
    status: item.status,
    title: item.title,
    description: item.description ?? item.title ?? item.id,
    entityModule: item.entityModule,
    entityId: item.entityId,
    sourceKind: item.sourceKind,
    currency: "EUR",
    subtotalAmountCents: 10_000,
    taxAmountCents: 1_000,
    totalAmountCents: 11_000,
    priceExpiresAt: null,
    warnings: item.warningCodes,
  }))
  const subtotal = lines.length * 10_000
  const tax = lines.length * 1_000
  return {
    id: "trsn_1",
    envelopeId: "trip_1",
    sourceEnvelopeUpdatedAt: NOW,
    titleSnapshot: "Bespoke trip",
    descriptionSnapshot: null,
    travelerPartySnapshot: {},
    constraintsSnapshot: {},
    currency: "EUR",
    subtotalAmountCents: subtotal,
    taxAmountCents: tax,
    totalAmountCents: subtotal + tax,
    componentCount: lines.length,
    pricedComponentCount: lines.length,
    frozenEnvelope: {},
    frozenComponents: components.map((component) => ({ ...component })),
    proposal: {
      envelopeId: "trip_1",
      title: "Bespoke trip",
      description: null,
      currency: "EUR",
      subtotalAmountCents: subtotal,
      taxAmountCents: tax,
      totalAmountCents: subtotal + tax,
      componentCount: lines.length,
      pricedComponentCount: lines.length,
      warnings: [],
      frozenAt: NOW.toISOString(),
      lines,
    },
    createdBy: "staff_1",
    createdAt: NOW,
  }
}

function pricing(
  total: number,
  policyEvidence?: PricingBreakdownV1["policyEvidence"],
): PricingBreakdownV1 {
  const tax = Math.round(total / 11)
  const subtotal = total - tax
  return {
    currency: "EUR",
    lines: [
      {
        kind: "base",
        label: "Live price",
        quantity: 1,
        unitAmount: subtotal,
        totalAmount: subtotal,
        pricingBasis: "per_booking",
      },
    ],
    taxes: [
      {
        code: "VAT",
        label: "VAT",
        rate: 10,
        amount: tax,
        base: subtotal,
      },
    ],
    subtotal,
    taxTotal: tax,
    total,
    ...(policyEvidence ? { policyEvidence } : {}),
  }
}

function entityId(session: BookingSessionInternalRecord) {
  return session.target.kind === "product"
    ? session.target.productId
    : session.target.kind === "catalog_item"
      ? session.target.catalogItemId
      : session.target.tripSnapshotId
}
