import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the catalog read/cancel boundary so this suite can assert quote,
// fail-closed reserve, and cancellation mapping without a live booking engine.
const quoteEntity = vi.fn()
const cancelEntity = vi.fn()

vi.mock("@voyant-travel/catalog/booking-engine", () => ({
  quoteEntity: (...args: unknown[]) => quoteEntity(...args),
  cancelEntity: (...args: unknown[]) => cancelEntity(...args),
  bookingDraftV1: { parse: (x: unknown) => x },
  quoteResponseV1: { parse: (x: unknown) => x },
}))

const { createCatalogComponentAdapter } = await import("../src/catalog-component.js")

import type { TripComponent, TripEnvelope } from "../src/schema.js"
import type { CatalogComponentQuoteInput, ReserveComponentInput } from "../src/service-types.js"

function envelope(constraints: Record<string, unknown> = {}): TripEnvelope {
  return {
    id: "trip_1",
    travelerParty: { travelers: [] },
    constraints,
    currency: "EUR",
  } as TripEnvelope
}

function component(overrides: Partial<TripComponent> = {}): TripComponent {
  return {
    id: "trcp_1",
    envelopeId: "trip_1",
    kind: "catalog_booking",
    status: "draft",
    entityModule: "products",
    entityId: "prod_1",
    sourceKind: "owned",
    sourceConnectionId: null,
    sourceRef: null,
    catalogQuoteId: "cq_1",
    bookingId: null,
    componentCurrency: "EUR",
    metadata: {},
    ...overrides,
  } as TripComponent
}

function adapterFor(over: Partial<Parameters<typeof createCatalogComponentAdapter>[0]> = {}) {
  return createCatalogComponentAdapter({
    db: {} as never,
    registry: { tag: "registry" } as never,
    ownedHandlers: { tag: "owned" } as never,
    evaluatePromotions: undefined,
    transformQuoteResult: vi.fn(async (result) => result),
    adapterContext: (connectionId) => ({
      connection_id: connectionId ?? "engine",
      correlation_id: "corr_1",
    }),
    startCheckout: vi.fn(async () => ({ kind: "hold_placed", bookingId: "bk_1" })),
    ...over,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("catalog component adapter — quote + tax recompute", () => {
  it("calls the injected tax transform and serializes the quote result", async () => {
    const quoted = {
      quoteId: "cq_1",
      available: true,
      quotedAt: new Date("2026-05-18T00:00:00.000Z"),
      expiresAt: new Date("2026-05-18T00:30:00.000Z"),
      pricing: { currency: "EUR", base_amount: 10000, fees: 0, surcharges: 0, taxes: 0 },
    }
    quoteEntity.mockResolvedValue(quoted)
    const transformQuoteResult = vi.fn(async (r: typeof quoted) => ({
      ...r,
      pricing: { ...r.pricing, taxes: 1900 },
    }))
    const api = adapterFor({ transformQuoteResult })

    const input: CatalogComponentQuoteInput = {
      component: component(),
      bookingDraft: { configure: { pax: { adult: 2 } } } as never,
      scope: { currency: "EUR" } as never,
    }
    const result = (await api.quote(input)) as { pricing: { taxTotal: number } }

    expect(transformQuoteResult).toHaveBeenCalledWith(quoted, "products", "prod_1", "owned")
    // serialized breakdown carries the recomputed tax through
    expect(result.pricing.taxTotal).toBe(1900)
  })
})

describe("catalog component adapter — reserve", () => {
  it("fails closed while Catalog booking creation is unavailable", async () => {
    const api = adapterFor()
    const input: ReserveComponentInput = {
      envelope: envelope({ createAsDraft: false }),
      component: component(),
      reservationPlanId: "rp_1",
    }
    await expect(api.reserve(input)).rejects.toThrow("catalog_booking_commit_not_available")
  })
})

describe("catalog component adapter — cancel + release mapping", () => {
  it("maps an async pending cancel to refused with the pending channel", async () => {
    cancelEntity.mockResolvedValue({
      status: "pending",
      pendingChannel: "partner_portal",
      snapshotId: "snap_1",
    })
    const api = adapterFor()
    const result = await api.cancel({
      envelope: envelope(),
      component: component({ bookingId: "bk_1" }),
      requestedAt: new Date(),
      request: {},
      preview: {} as never,
    })
    expect(result.status).toBe("refused")
    expect(result.reason).toBe("cancel_pending:partner_portal")
  })

  it("returns missing_component_booking_ref when refs are absent", async () => {
    const api = adapterFor()
    const result = await api.cancel({
      envelope: envelope(),
      component: component({ bookingId: null }),
      requestedAt: new Date(),
      request: {},
      preview: {} as never,
    })
    expect(result).toEqual({ status: "refused", reason: "missing_component_booking_ref" })
    expect(cancelEntity).not.toHaveBeenCalled()
  })

  it("reports released=true when the cancel succeeds (compensation path)", async () => {
    cancelEntity.mockResolvedValue({ status: "cancelled" })
    const api = adapterFor()
    const result = await api.release({
      component: component({ bookingId: "bk_1" }),
      reserveResult: { status: "held" },
    })
    expect(result).toEqual({ released: true, reason: undefined })
  })

  it("reports released=false on release errors", async () => {
    cancelEntity.mockRejectedValue(new Error("boom"))
    const api = adapterFor()
    const result = await api.release({
      component: component({ bookingId: "bk_1" }),
      reserveResult: { status: "held" },
    })
    expect(result).toEqual({ released: false, reason: "boom" })
  })
})
