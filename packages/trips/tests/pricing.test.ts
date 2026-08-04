import type { AnyDrizzleDb } from "@voyant-travel/db"
import { describe, expect, it, vi } from "vitest"
import type { NewTripComponentEvent, TripComponent, TripEnvelope } from "../src/schema.js"
import { tripComponentEvents, tripComponents, tripEnvelopes } from "../src/schema.js"
import {
  aggregateComponentPricing,
  pricingSnapshotFromBreakdown,
  taxLinesFromBreakdown,
  tripsService,
} from "../src/service.js"

describe("trips pricing helpers", () => {
  it("preserves component-level tax lines from booking-engine pricing", () => {
    const pricing = {
      currency: "EUR",
      lines: [{ kind: "base" as const, label: "Stay", unitAmount: 10000, totalAmount: 10000 }],
      taxes: [
        {
          code: "vat-ro-9",
          label: "VAT 9%",
          rate: 0.09,
          amount: 900,
          base: 10000,
          includedInPrice: false,
          scope: "excluded" as const,
        },
      ],
      subtotal: 10000,
      taxTotal: 900,
      total: 10900,
    }

    expect(pricingSnapshotFromBreakdown(pricing, "2026-05-18T12:00:00.000Z")).toEqual({
      currency: "EUR",
      subtotalAmountCents: 10000,
      taxAmountCents: 900,
      totalAmountCents: 10900,
      priceExpiresAt: "2026-05-18T12:00:00.000Z",
      warnings: undefined,
    })
    expect(taxLinesFromBreakdown(pricing)).toEqual([
      {
        code: "vat-ro-9",
        label: "VAT 9%",
        amountCents: 900,
        baseAmountCents: 10000,
        rate: 0.09,
        includedInPrice: false,
        source: "excluded",
      },
    ])
  })

  it("prices accommodation components with the persisted stay date range", async () => {
    const state = {
      envelope: envelope(),
      components: [
        component({
          entityModule: "accommodations",
          entityId: "acc_123",
          metadata: {
            bookingDraftV1: {
              entity: { module: "accommodations", id: "acc_123", sourceKind: "owned" },
              configure: {
                pax: { adult: 2 },
                dateRange: { checkIn: "2026-07-01", checkOut: "2026-07-04" },
              },
            },
          },
        }),
      ],
      events: [] as NewTripComponentEvent[],
    }
    const quoteCatalogComponent = vi.fn(async () => ({
      binding: false as const,
      available: true,
      requirements: {} as never,
      pricing: {
        currency: "EUR",
        lines: [{ kind: "base" as const, label: "Stay", unitAmount: 30000, totalAmount: 30000 }],
        taxes: [],
        subtotal: 30000,
        taxTotal: 0,
        total: 30000,
      },
    }))

    await tripsService.priceTrip(
      makeFakeDb(state),
      {
        envelopeId: state.envelope.id,
        scope: { locale: "en-GB", audience: "staff", market: "default", currency: "EUR" },
      },
      { quoteCatalogComponent },
    )

    expect(quoteCatalogComponent).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingDraft: expect.objectContaining({
          configure: expect.objectContaining({
            dateRange: { checkIn: "2026-07-01", checkOut: "2026-07-04" },
          }),
        }),
      }),
    )
  })

  it("rejects accommodation pricing when the component has no stay date range", async () => {
    const state = {
      envelope: envelope(),
      components: [
        component({
          entityModule: "accommodations",
          entityId: "acc_123",
          metadata: {
            bookingDraftV1: {
              entity: { module: "accommodations", id: "acc_123", sourceKind: "owned" },
              configure: { pax: { adult: 2 } },
            },
          },
        }),
      ],
      events: [] as NewTripComponentEvent[],
    }
    const quoteCatalogComponent = vi.fn()

    await expect(
      tripsService.priceTrip(
        makeFakeDb(state),
        {
          envelopeId: state.envelope.id,
          scope: { locale: "en-GB", audience: "staff", market: "default", currency: "EUR" },
        },
        { quoteCatalogComponent },
      ),
    ).rejects.toThrow(/valid check-in\/check-out date range/)
    expect(quoteCatalogComponent).not.toHaveBeenCalled()
  })

  it("aggregates component totals without blending tax treatment", () => {
    const aggregate = aggregateComponentPricing(
      [
        {
          pricingSnapshot: {
            currency: "EUR",
            subtotalAmountCents: 10000,
            taxAmountCents: 900,
            totalAmountCents: 10900,
          },
          warningCodes: [],
        },
        {
          pricingSnapshot: {
            currency: "EUR",
            subtotalAmountCents: 20000,
            taxAmountCents: 3800,
            totalAmountCents: 23800,
          },
          warningCodes: ["manual_placeholder_price"],
        },
      ],
      "EUR",
    )

    expect(aggregate).toEqual({
      currency: "EUR",
      subtotalAmountCents: 30000,
      taxAmountCents: 4700,
      totalAmountCents: 34700,
      componentCount: 2,
      pricedComponentCount: 2,
      warnings: ["manual_placeholder_price"],
    })
  })

  it("warns and excludes mismatched currencies from the aggregate amount", () => {
    const aggregate = aggregateComponentPricing(
      [
        {
          pricingSnapshot: {
            currency: "EUR",
            subtotalAmountCents: 10000,
            taxAmountCents: 900,
            totalAmountCents: 10900,
          },
          warningCodes: [],
        },
        {
          pricingSnapshot: {
            currency: "USD",
            subtotalAmountCents: 10000,
            taxAmountCents: 0,
            totalAmountCents: 10000,
          },
          warningCodes: [],
        },
      ],
      "EUR",
    )

    expect(aggregate.totalAmountCents).toBe(10900)
    expect(aggregate.warnings).toEqual(["currency_mismatch:USD"])
  })

  it("excludes cancelled and removed component values from aggregate totals", () => {
    const aggregate = aggregateComponentPricing(
      [
        {
          status: "booked",
          pricingSnapshot: {
            currency: "EUR",
            subtotalAmountCents: 10000,
            taxAmountCents: 900,
            totalAmountCents: 10900,
          },
          warningCodes: [],
        },
        {
          status: "cancelled",
          pricingSnapshot: {
            currency: "EUR",
            subtotalAmountCents: 20000,
            taxAmountCents: 1800,
            totalAmountCents: 21800,
          },
          warningCodes: [],
        },
        {
          status: "removed",
          pricingSnapshot: {
            currency: "EUR",
            subtotalAmountCents: 30000,
            taxAmountCents: 2700,
            totalAmountCents: 32700,
          },
          warningCodes: [],
        },
      ],
      "EUR",
    )

    expect(aggregate).toEqual({
      currency: "EUR",
      subtotalAmountCents: 10000,
      taxAmountCents: 900,
      totalAmountCents: 10900,
      componentCount: 1,
      pricedComponentCount: 1,
      warnings: [],
    })
  })
})

function envelope(overrides: Partial<TripEnvelope> = {}): TripEnvelope {
  return {
    id: "trip_123",
    status: "draft",
    title: null,
    description: null,
    travelerParty: {},
    constraints: {},
    aggregateCurrency: null,
    aggregateSubtotalAmountCents: null,
    aggregateTaxAmountCents: null,
    aggregateTotalAmountCents: null,
    aggregatePricingSnapshot: null,
    currentPriceExpiresAt: null,
    bookingGroupId: null,
    orderId: null,
    paymentSessionId: null,
    reserveIdempotencyKey: null,
    reserveStartedAt: null,
    reservedAt: null,
    checkoutIdempotencyKey: null,
    checkoutStartedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-05-18T00:00:00.000Z"),
    updatedAt: new Date("2026-05-18T00:00:00.000Z"),
    ...overrides,
  }
}

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

function makeFakeDb(state: {
  envelope: TripEnvelope
  components: TripComponent[]
  events: NewTripComponentEvent[]
}): AnyDrizzleDb {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => (table === tripEnvelopes ? [state.envelope] : []),
          orderBy: async () =>
            table === tripComponents
              ? [...state.components].sort((a, b) => a.sequence - b.sequence)
              : [],
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: Partial<TripEnvelope & TripComponent>) => ({
        where: () => ({
          returning: async () => {
            if (table === tripEnvelopes) {
              Object.assign(state.envelope, patch)
              return [state.envelope]
            }
            if (table === tripComponents) {
              Object.assign(state.components[0], patch)
              return [state.components[0]]
            }
            return []
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (value: NewTripComponentEvent) => {
        if (table === tripComponentEvents) state.events.push(value)
        return { returning: async () => [] }
      },
    }),
  } as AnyDrizzleDb
}
