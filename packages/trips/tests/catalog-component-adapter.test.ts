import { describe, expect, it } from "vitest"
import {
  assertCatalogComponentBookingDraftReady,
  bookingDraftFromComponent,
  isCatalogBackedTripComponent,
  toBookingSelectionV1,
} from "../src/catalog-component-adapter.js"
import type { TripComponent } from "../src/schema.js"
import { TripsInvariantError } from "../src/service.js"
import { createTripComponentBodySchema } from "../src/validation.js"

function component(overrides: Partial<TripComponent> = {}): TripComponent {
  return {
    id: "trcp_123",
    envelopeId: "trip_123",
    sequence: 0,
    kind: "catalog_booking",
    status: "draft",
    title: null,
    description: null,
    entityModule: "products",
    entityId: "prod_123",
    sourceKind: "owned",
    sourceConnectionId: null,
    sourceRef: null,
    bookingDraftId: null,
    catalogQuoteId: null,
    bookingId: null,
    bookingGroupId: null,
    orderId: null,
    paymentSessionId: null,
    providerRef: null,
    supplierRef: null,
    componentCurrency: null,
    componentSubtotalAmountCents: null,
    componentTaxAmountCents: null,
    componentTotalAmountCents: null,
    pricingSnapshot: null,
    taxLines: [],
    cancellationSnapshot: null,
    holdToken: null,
    holdExpiresAt: null,
    priceExpiresAt: null,
    warningCodes: [],
    metadata: {},
    createdAt: new Date("2026-05-18T00:00:00.000Z"),
    updatedAt: new Date("2026-05-18T00:00:00.000Z"),
    ...overrides,
  }
}

describe("catalog component adapter", () => {
  it("maps a catalog-backed component into a booking draft", () => {
    const draft = toBookingSelectionV1(component(), {
      configure: { pax: { adult: 2 } },
      payment: { intent: "hold" },
    })

    expect(draft.entity).toEqual({
      module: "products",
      id: "prod_123",
      sourceKind: "owned",
    })
    expect(draft.configure.pax).toEqual({ adult: 2 })
    expect(draft.addons).toEqual([])
  })

  it("passes through sourced refs when present", () => {
    const draft = toBookingSelectionV1(
      component({
        sourceKind: "sourced",
        sourceConnectionId: "conn_123",
        sourceRef: "upstream/product/42",
      }),
    )

    expect(draft.entity.sourceConnectionId).toBe("conn_123")
    expect(draft.entity.sourceRef).toBe("upstream/product/42")
  })

  it("reads persisted booking drafts before applying quote overrides", () => {
    const draft = bookingDraftFromComponent(
      component({
        entityModule: "accommodations",
        entityId: "acc_123",
        metadata: {
          bookingDraftV1: {
            entity: { module: "accommodations", id: "acc_123", sourceKind: "owned" },
            configure: {
              pax: { adult: 1 },
              dateRange: { checkIn: "2026-07-01", checkOut: "2026-07-04" },
            },
          },
        },
      }),
      { configure: { pax: { adult: 2 } } },
    )

    expect(draft.configure.dateRange).toEqual({
      checkIn: "2026-07-01",
      checkOut: "2026-07-04",
    })
    expect(draft.configure.pax).toEqual({ adult: 2 })
  })

  it("requires accommodation catalog components to carry a valid stay date range", () => {
    expect(() =>
      assertCatalogComponentBookingDraftReady(
        component({
          entityModule: "accommodations",
          metadata: {
            bookingDraftV1: {
              entity: { module: "accommodations", id: "acc_123", sourceKind: "owned" },
              configure: { pax: { adult: 1 } },
            },
          },
        }),
      ),
    ).toThrowError(/valid check-in\/check-out date range/)

    expect(() =>
      assertCatalogComponentBookingDraftReady(
        component({
          entityModule: "accommodations",
          entityId: "acc_123",
          metadata: {
            bookingDraftV1: {
              entity: { module: "accommodations", id: "acc_123", sourceKind: "owned" },
              configure: {
                pax: { adult: 1 },
                dateRange: { checkIn: "2026-07-01", checkOut: "2026-07-04" },
              },
            },
          },
        }),
      ),
    ).not.toThrow()
  })

  it("detects catalog-backed components", () => {
    expect(isCatalogBackedTripComponent(component())).toBe(true)
    expect(isCatalogBackedTripComponent(component({ kind: "manual_placeholder" }))).toBe(false)
    expect(isCatalogBackedTripComponent(component({ entityId: null }))).toBe(false)
  })

  it("rejects placeholders and incomplete refs", () => {
    expect(() => toBookingSelectionV1(component({ kind: "manual_placeholder" }))).toThrowError(
      TripsInvariantError,
    )
    expect(() => toBookingSelectionV1(component({ sourceKind: null }))).toThrowError(
      /catalog entity refs/,
    )
  })

  it("rejects accommodation add payloads without check-in and check-out dates", () => {
    const result = createTripComponentBodySchema.safeParse({
      kind: "catalog_booking",
      catalogRef: {
        entityModule: "accommodations",
        entityId: "acc_123",
        sourceKind: "owned",
      },
      metadata: {
        bookingDraftV1: {
          entity: { module: "accommodations", id: "acc_123", sourceKind: "owned" },
          configure: { pax: { adult: 1 } },
        },
      },
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([
      "metadata",
      "bookingDraftV1",
      "configure",
      "dateRange",
    ])
  })

  it("accepts accommodation add payloads with an ordered date range", () => {
    expect(
      createTripComponentBodySchema.safeParse({
        kind: "catalog_booking",
        catalogRef: {
          entityModule: "accommodations",
          entityId: "acc_123",
          sourceKind: "owned",
        },
        metadata: {
          bookingDraftV1: {
            entity: { module: "accommodations", id: "acc_123", sourceKind: "owned" },
            configure: {
              pax: { adult: 1 },
              dateRange: { checkIn: "2026-07-01", checkOut: "2026-07-04" },
            },
          },
        },
      }).success,
    ).toBe(true)
  })
})
