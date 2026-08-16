import { describe, expect, it, vi } from "vitest"

import type { CatalogEntityPaymentPolicyReaders } from "../runtime-contracts.js"
import { createProductionBookingSessionPaymentPorts } from "./sessions-payment-production.js"
import type { BookingSessionCompositeHandler } from "./sessions-service.js"

/**
 * What the port asked the cascade about, in order. A `PaymentPolicyEntityContext`
 * is the whole of what the readers get, so this is the observable statement of
 * which listing a Session was charged against.
 */
const entityCalls: Array<{ layer: string; context: Record<string, unknown> }> = []

const computePaymentSchedule = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => [
    { amountCents: 10_000, currency: "EUR", scheduleType: "full", dueDate: "2026-08-05" },
  ]),
)

const resolveEffectivePaymentPolicy = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => ({ policy: { kind: "deposit" }, source: "listing" as string })),
)

const createOrReuseBookingSessionPayment = vi.hoisted(() =>
  vi.fn(async (_db: unknown, input: { amountCents: number; currency: string }) => ({
    id: "pmts_1",
    status: "pending",
    amountCents: input.amountCents,
    currency: input.currency,
    redirectUrl: null,
    expiresAt: null,
  })),
)

vi.mock("@voyant-travel/finance", () => ({
  computePaymentSchedule,
  createOrReuseBookingSessionPayment,
  expirePendingBookingSessionPayments: vi.fn(),
  financeService: { getPaymentSessionById: vi.fn(async () => null) },
  findEstablishedBookingSessionPayment: async () => null,
  noDepositPolicy: { kind: "no_deposit" },
  resolveEffectivePaymentPolicy,
  resolvePaymentCallbackUrl: () => undefined,
  startPaymentAdapterCardPayment: vi.fn(),
  transferBookingSessionPaymentToBooking: vi.fn(),
}))

/**
 * The three layers, each recording what it was keyed on. Only the listing layer
 * answers, so a plan that came back proves the entity cascade — not the product
 * reader — produced it.
 */
function entityPolicyReaders(
  describeEntity?: CatalogEntityPaymentPolicyReaders["describeEntity"],
): CatalogEntityPaymentPolicyReaders {
  const layerReader = (layer: string) => async (_db: unknown, context: Record<string, unknown>) => {
    entityCalls.push({ layer, context })
    return layer === "listing" ? ({ deposit: { kind: "percent", percent: 20 } } as never) : null
  }
  return {
    resolveListingPolicyForEntity: layerReader("listing") as never,
    resolveCategoryPolicyForEntity: layerReader("category") as never,
    resolveSupplierPolicyForEntity: layerReader("supplier") as never,
    ...(describeEntity ? { describeEntity } : {}),
  }
}

/** The one sourced entry the fake database holds, or none. */
function sourcedEntryDb(row?: Record<string, unknown>) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (row ? [row] : []) }),
      }),
    }),
  } as never
}

const productReaders = {
  loadProductPaymentPolicyContext: vi.fn(async () => ({
    listingPolicy: null,
    categoryPolicy: null,
    supplierId: null,
    name: "Danube Delta tour",
  })),
  resolveSelectedDepartureDate: vi.fn(async () => "2026-11-02"),
}

function ports(
  input: {
    entityPolicy?: CatalogEntityPaymentPolicyReaders
    composite?: BookingSessionCompositeHandler
    db?: unknown
  } = {},
) {
  return createProductionBookingSessionPaymentPorts({
    db: (input.db ?? {}) as never,
    inventory: productReaders as never,
    distribution: { loadSupplierPaymentPolicy: async () => null },
    settings: { resolveOperatorDefaultPaymentPolicy: async () => null },
    ...(input.entityPolicy ? { entityPolicy: input.entityPolicy } : {}),
    ...(input.composite ? { resolveCompositeHandler: () => input.composite } : {}),
  })
}

function prepareInput(target: Record<string, unknown>, statePayload: Record<string, unknown> = {}) {
  return {
    session: {
      id: "bses_01k",
      actorKind: "customer",
      scope: { locale: "en-GB", market: "default" },
      target,
      expiresAt: new Date("2026-08-06T00:00:00Z"),
      statePayload: {
        billing: { contact: { firstName: "Ana", lastName: "Pop", email: "ana@example.com" } },
        ...statePayload,
      },
    },
    quote: {
      id: "bqot_01k",
      pricing: { total: 10_000, currency: "EUR" },
      quotedAt: new Date("2026-08-05T00:00:00Z"),
      expiresAt: new Date("2026-08-06T00:00:00Z"),
    },
    commit: { idempotencyKey: "commit-1" },
    access: { actorKind: "customer" },
    now: new Date("2026-08-05T00:00:00Z"),
  } as never
}

describe("Booking Session payment for an owned-entity target", () => {
  it("charges an accommodation through the entity cascade instead of collecting nothing", async () => {
    entityCalls.length = 0
    const prepared = await ports({ entityPolicy: entityPolicyReaders() }).prepare(
      prepareInput({ kind: "owned_entity", entityModule: "accommodations", entityId: "acpr_1" }),
    )

    expect(prepared.kind).toBe("required")
    expect(createOrReuseBookingSessionPayment).toHaveBeenCalled()
    // The product reader has no answer for a property and must not be consulted
    // for one — the listing policy came from the vertical's own rows.
    expect(productReaders.loadProductPaymentPolicyContext).not.toHaveBeenCalled()
    expect(entityCalls.map((call) => call.layer).sort()).toEqual([
      "category",
      "listing",
      "supplier",
    ])
  })

  it("keys the cascade on the journey selection the shopper made", async () => {
    entityCalls.length = 0
    await ports({ entityPolicy: entityPolicyReaders() }).prepare(
      prepareInput(
        { kind: "owned_entity", entityModule: "cruises", entityId: "crui_1" },
        { configure: { sailingId: "sail_1", cabinCategoryId: "cbcg_1" } },
      ),
    )

    expect(entityCalls[0]?.context).toEqual({
      entityModule: "cruises",
      entityId: "crui_1",
      sailingId: "sail_1",
      cabinCategoryId: "cbcg_1",
    })
  })

  it("reads a stay's rate plan off the room the shopper selected", async () => {
    entityCalls.length = 0
    await ports({ entityPolicy: entityPolicyReaders() }).prepare(
      prepareInput(
        { kind: "owned_entity", entityModule: "accommodations", entityId: "acpr_1" },
        { accommodation: { rooms: [{ ratePlanId: "rtpl_1" }] } },
      ),
    )

    expect(entityCalls[0]?.context).toMatchObject({ ratePlanId: "rtpl_1" })
  })

  /**
   * The deposit gate is a distance-to-departure test, so a date the client
   * states could buy a deposit on a stay starting next week. Without a vertical
   * saying when the shopper travels, the schedule is anchored on nothing and the
   * full total is collected — over-collection is refundable and is quoted before
   * the shopper accepts; under-collection is money that never arrives.
   */
  it("anchors on nothing when the vertical states no travel date", async () => {
    await ports({ entityPolicy: entityPolicyReaders() }).prepare(
      prepareInput(
        { kind: "owned_entity", entityModule: "accommodations", entityId: "acpr_1" },
        { configure: { departureDate: "2027-01-01" } },
      ),
    )

    expect(computePaymentSchedule.mock.calls.at(-1)?.[0]).toMatchObject({ departureDate: null })
  })

  it("measures from the date the vertical states", async () => {
    await ports({
      entityPolicy: entityPolicyReaders(async () => ({
        name: "Casa Verde — Deluxe",
        departureDate: "2026-11-20",
      })),
    }).prepare(
      prepareInput({ kind: "owned_entity", entityModule: "accommodations", entityId: "acpr_1" }),
    )

    expect(computePaymentSchedule.mock.calls.at(-1)?.[0]).toMatchObject({
      departureDate: "2026-11-20",
    })
  })

  /**
   * An owned product reached through the generic arm is still a product. Its own
   * reader carries the category layer and a localized name that the entity
   * cascade cannot produce, so routing it there would lose both.
   */
  it("routes an owned product to the product reader", async () => {
    productReaders.loadProductPaymentPolicyContext.mockClear()
    await ports({ entityPolicy: entityPolicyReaders() }).prepare(
      prepareInput({ kind: "owned_entity", entityModule: "products", entityId: "prod_1" }),
    )

    expect(productReaders.loadProductPaymentPolicyContext).toHaveBeenCalled()
    expect(computePaymentSchedule.mock.calls.at(-1)?.[0]).toMatchObject({
      departureDate: "2026-11-02",
    })
  })
})

describe("Booking Session payment for a sourced target", () => {
  it("resolves the entry to its entity and charges against that listing", async () => {
    entityCalls.length = 0
    const prepared = await ports({
      entityPolicy: entityPolicyReaders(),
      db: sourcedEntryDb({
        entityModule: "accommodations",
        entityId: "acpr_upstream",
        projection: { name: "Hotel Lipoveanul" },
      }),
    }).prepare(prepareInput({ kind: "catalog_item", catalogItemId: "acpr_upstream" }))

    expect(prepared.kind).toBe("required")
    expect(entityCalls[0]?.context).toMatchObject({
      entityModule: "accommodations",
      entityId: "acpr_upstream",
    })
  })

  /**
   * The Commit arm owns whether a withdrawn entry is still bookable and answers
   * `entity_not_bookable`. Failing here would replace that rejection with an
   * unhandled error for the same fact, and nothing can be committed to charge
   * against anyway.
   */
  it("leaves a withdrawn entry to the Commit arm", async () => {
    await expect(
      ports({ entityPolicy: entityPolicyReaders(), db: sourcedEntryDb() }).prepare(
        prepareInput({ kind: "catalog_item", catalogItemId: "acpr_gone" }),
      ),
    ).resolves.toEqual({ kind: "not_required" })
  })
})

describe("Booking Session payment for a composite target", () => {
  it("collects on the context the Trip states", async () => {
    const describePaymentContext = vi.fn(async () => ({
      listingPolicy: null,
      categoryPolicy: null,
      supplierPolicy: null,
      departureDate: "2026-12-01",
      name: "Bucharest & the Delta",
    }))
    const prepared = await ports({
      composite: { describePaymentContext } as never,
    }).prepare(
      prepareInput({
        kind: "trip_snapshot",
        tripSnapshotId: "trps_1",
        tripEnvelopeId: "trpe_1",
      }),
    )

    expect(prepared.kind).toBe("required")
    expect(describePaymentContext).toHaveBeenCalledWith(
      expect.objectContaining({ tripSnapshotId: "trps_1", tripEnvelopeId: "trpe_1" }),
    )
    expect(computePaymentSchedule.mock.calls.at(-1)?.[0]).toMatchObject({
      departureDate: "2026-12-01",
    })
  })

  /**
   * The one honest `not_required` for a target kind: the handler that owns Trips
   * says it has no payment context. Before voyant#4745 this outcome was reached
   * without asking anyone.
   */
  it("collects nothing when the handler states no context", async () => {
    await expect(
      ports({ composite: {} as never }).prepare(
        prepareInput({
          kind: "trip_snapshot",
          tripSnapshotId: "trps_1",
          tripEnvelopeId: "trpe_1",
        }),
      ),
    ).resolves.toEqual({ kind: "not_required" })
  })
})

describe("Booking Session payment plan projection", () => {
  it("publishes the plan a non-product target will be charged on", async () => {
    const plan = await ports({ entityPolicy: entityPolicyReaders() }).describePlan?.({
      session: {
        id: "bses_01k",
        target: { kind: "owned_entity", entityModule: "accommodations", entityId: "acpr_1" },
        scope: { locale: "en-GB", market: "default" },
        statePayload: {},
      },
      pricing: { total: 10_000, currency: "EUR" },
      now: new Date("2026-08-05T00:00:00Z"),
    } as never)

    expect(plan).toMatchObject({ policySource: "listing", dueNowCents: 10_000 })
  })
})
