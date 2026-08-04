import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the catalog read/cancel boundary so this suite can assert preview
// pricing, fail-closed reserve, and cancellation mapping without a live
// booking engine.
const cancelEntity = vi.fn()

vi.mock("@voyant-travel/catalog/booking-engine", () => ({
  cancelEntity: (...args: unknown[]) => cancelEntity(...args),
  bookingSelectionV1: { parse: (x: unknown) => x },
}))
vi.mock("@voyant-travel/catalog/booking-engine/contracts", () => ({
  bookingSelectionPublicV1: { parse: (x: unknown) => x },
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
    previewOffer: vi.fn(async () => ({
      kind: "offer_preview" as const,
      preview: { binding: false as const, available: false, requirements: {} as never },
    })),
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

describe("catalog component adapter — quote through Offer Preview", () => {
  const quoteInput = (): CatalogComponentQuoteInput => ({
    component: component(),
    bookingDraft: { configure: { pax: { adult: 2 } } } as never,
    scope: { currency: "EUR" } as never,
  })

  it("names the component as an Offer Preview target and returns the preview", async () => {
    const preview = {
      binding: false as const,
      available: true,
      requirements: {} as never,
      pricing: {
        currency: "EUR",
        lines: [],
        taxes: [],
        subtotal: 10000,
        taxTotal: 1900,
        total: 11900,
      },
    }
    const previewOffer = vi.fn(async () => ({ kind: "offer_preview" as const, preview }))
    const api = adapterFor({ previewOffer })

    const result = await api.quote(quoteInput())

    expect(previewOffer).toHaveBeenCalledWith({
      target: { kind: "product", productId: "prod_1" },
      scope: { locale: "en-GB", market: "default", currency: "EUR" },
      selection: { configure: { pax: { adult: 2 } } },
    })
    expect(result).toBe(preview)
  })

  it("names a sourced component as a catalog_item", async () => {
    const previewOffer = vi.fn(async () => ({
      kind: "offer_preview" as const,
      preview: { binding: false as const, available: false, requirements: {} as never },
    }))
    const api = adapterFor({ previewOffer })

    await api.quote({
      ...quoteInput(),
      component: component({ sourceKind: "voyant-connect", entityId: "cse_1" }),
    })

    expect(previewOffer).toHaveBeenCalledWith(
      expect.objectContaining({ target: { kind: "catalog_item", catalogItemId: "cse_1" } }),
    )
  })

  it("raises a rejected preview rather than reporting an unpriced component", async () => {
    const previewOffer = vi.fn(async () => ({
      kind: "rejected" as const,
      error: { kind: "not_authorized" as const },
    }))
    const api = adapterFor({ previewOffer })

    await expect(api.quote(quoteInput())).rejects.toThrow(
      "catalog_component_preview_rejected:not_authorized",
    )
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
