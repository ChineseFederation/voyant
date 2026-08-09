import { type CruiseAdapter, cruiseAdapterToSourceAdapter } from "@voyant-travel/cruises/adapters"
import { describe, expect, it, vi } from "vitest"

import {
  createClosedStorefrontShoppingLiveProvider,
  createManagedStorefrontShoppingRuntime,
  type StorefrontResolvedScope,
  type StorefrontShoppingContext,
} from "../../src/shopping/index.js"

const NOW = new Date("2026-08-09T10:00:00.000Z")
const context = {
  storefrontId: "storefront_trusted",
  channelId: "channel_trusted",
  userId: "user_trusted",
  buyerAccountId: "buyer_trusted",
} satisfies StorefrontShoppingContext
const scope = {
  marketId: "market_ro",
  locale: "ro-RO",
  currency: "EUR",
  available: { marketIds: ["market_ro"], locales: ["ro-RO"], currencies: ["EUR"] },
} satisfies StorefrontResolvedScope
const intent = {
  kind: "cruise" as const,
  query: "Danube",
  departureDateFrom: "2027-04-01",
  departureDateTo: "2027-04-30",
  travelers: { adults: 2 },
  cruiseTypes: ["river" as const],
}

function primitives() {
  return {
    env: vi.fn(() => ({ CRUISE_TOKEN: "credential_secret" })),
    database: { resolve: vi.fn(() => ({ id: "db" })) },
    storage: {},
    events: {},
    config: {},
  } as never
}

function markets() {
  return {
    listActiveMarkets: vi.fn(async () => [
      {
        id: scope.marketId,
        defaultLocale: scope.locale,
        defaultCurrency: scope.currency,
        locales: [scope.locale],
        currencies: [scope.currency],
      },
    ]),
  }
}

function cruiseAdapter(overrides: Partial<CruiseAdapter> = {}): CruiseAdapter {
  const cruiseRef = { connectionId: "provider_connection_secret", externalId: "cruise_secret" }
  const sailingRef = { connectionId: "provider_connection_secret", externalId: "sailing_secret" }
  const shipRef = { connectionId: "provider_connection_secret", externalId: "ship_secret" }
  const cabinRef = { connectionId: "provider_connection_secret", externalId: "cabin_secret" }
  return {
    name: "provider-secret",
    version: "1.0.0",
    async listEntries() {
      return {
        entries: [
          {
            sourceRef: cruiseRef,
            name: "Danube Discovery",
            slug: "danube-discovery",
            cruiseType: "river",
            lineName: "Public Cruise Line",
            shipName: "Public Ship",
            nights: 7,
            heroImageUrl: "https://images.example.test/danube.jpg",
          },
        ],
      }
    },
    async *searchProjection() {},
    async fetchCruise() {
      return null
    },
    async fetchSailing() {
      return null
    },
    async fetchSailingPricing() {
      return [
        {
          cabinCategoryRef: cabinRef,
          occupancy: 2,
          fareCode: "PUBLIC",
          fareVariant: "cruise_only",
          currency: "RON",
          pricePerPerson: "2500.00",
          availability: "limited",
          bookingTerms: { paymentTerms: { depositPercent: "20" } },
        },
      ]
    },
    async fetchSailingItinerary() {
      return []
    },
    async fetchShip() {
      return {
        sourceRef: shipRef,
        name: "Public Ship",
        slug: "public-ship",
        shipType: "river",
        categories: [
          {
            sourceRef: cabinRef,
            code: "BAL",
            name: "Balcony cabin",
            roomType: "balcony",
            minOccupancy: 1,
            maxOccupancy: 2,
          },
        ],
      }
    },
    async listSailingsForCruise() {
      return [
        {
          sourceRef: sailingRef,
          cruiseRef,
          shipRef,
          departureDate: "2027-04-12",
          returnDate: "2027-04-19",
          embarkPortName: "Budapest",
          disembarkPortName: "Bucharest",
          salesStatus: "open",
        },
      ]
    },
    async createBooking() {
      return { connectorBookingRef: "booking_secret", connectorStatus: "confirmed" }
    },
    async getBookingByIdempotencyKey() {
      return null
    },
    ...overrides,
  }
}

function closedProvider(
  adapters: Array<[string, ReturnType<typeof cruiseAdapterToSourceAdapter>]>,
) {
  const registry = {
    connections: () => adapters.map(([id]) => id),
    resolveByConnection: (id: string) => adapters.find(([candidate]) => candidate === id)?.[1],
  }
  return createClosedStorefrontShoppingLiveProvider({
    primitives: primitives(),
    catalogServices: {
      ensureSourceRegistry: vi.fn(async () => registry),
      getOwnedAvailabilitySearchHandlers: () => ({ modules: () => [], resolve: () => undefined }),
    } as never,
    markets: markets(),
  })
}

describe("closed live cruise commerce", () => {
  it("issues only scope/owner-bound opaque refs and normalizes presentation money managed-side", async () => {
    const source = cruiseAdapterToSourceAdapter(cruiseAdapter(), { sourceKind: "cruise:private" })
    const live = closedProvider([["connection_private", source]])
    const issued: Record<string, unknown>[] = []
    const runtime = createManagedStorefrontShoppingRuntime({
      markets: markets(),
      catalog: { searchSlice: async () => ({ items: [], total: 0 }) },
      live,
      references: {
        async issue(input) {
          issued.push(input as unknown as Record<string, unknown>)
          return {
            ref: "opaque-cruise-offer-0000000000000001",
            expiresAt: "2026-08-09T10:15:00.000Z",
          }
        },
      },
      quoteFx: async () => ({
        rate: "0.2",
        provider: "voyant-data-fx",
        quotedAt: NOW.toISOString(),
        validUntil: "2026-08-10T10:00:00.000Z",
      }),
      now: () => NOW,
    })

    const result = await runtime.search(context, { scope, intent })

    expect(result).toMatchObject({
      kind: "cruise",
      offers: [
        {
          offerRef: "opaque-cruise-offer-0000000000000001",
          title: "Danube Discovery",
          departureDate: "2027-04-12",
          cabinName: "Balcony cabin",
          availability: "limited",
          price: {
            native: { amount: "5000.00", currency: "RON" },
            presentation: { amount: "1000.00", currency: "EUR" },
          },
          expiresAt: "2026-08-09T10:15:00.000Z",
        },
      ],
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("connection_private")
    expect(serialized).not.toContain("provider_connection_secret")
    expect(serialized).not.toContain("cruise_secret")
    expect(serialized).not.toContain("credential_secret")
    expect(issued[0]).toMatchObject({
      purpose: "cruise-offer",
      storefrontId: context.storefrontId,
      channelId: context.channelId,
      owner: { userId: context.userId, buyerAccountId: context.buyerAccountId },
      scope: { marketId: "market_ro", locale: "ro-RO", currency: "EUR" },
      payload: {
        selection: {
          configure: {
            sailingId: expect.stringMatching(/^sr_/),
            cabinCategoryId: expect.stringMatching(/^sr_/),
          },
        },
      },
      ttlSeconds: 900,
      replay: "single-use",
    })
    expect(JSON.stringify(issued[0])).toContain("sourceConnectionId")
    expect(JSON.stringify(issued[0])).not.toContain("sailing_secret")
    expect(JSON.stringify(issued[0])).not.toContain("cabin_secret")
  })

  it("fails closed without idempotency reconciliation or for request-only fares", async () => {
    const withoutReconciliation = cruiseAdapter()
    withoutReconciliation.getBookingByIdempotencyKey = undefined
    const unsupportedFare = cruiseAdapter({
      async fetchSailingPricing() {
        const row = await cruiseAdapter().fetchSailingPricing({ externalId: "sailing_secret" })
        return row.map((price) => ({ ...price, requiresRequest: true }))
      },
    })
    const live = closedProvider([
      ["no_reconciliation", cruiseAdapterToSourceAdapter(withoutReconciliation)],
      ["request_only", cruiseAdapterToSourceAdapter(unsupportedFare)],
    ])

    await expect(live.searchCruises({ context, scope, intent })).resolves.toEqual({
      items: [],
      sources: [{ status: "empty" }],
    })
  })

  it("retains partial source coverage without leaking source health identity", async () => {
    const healthy = cruiseAdapterToSourceAdapter(cruiseAdapter())
    const failing = cruiseAdapterToSourceAdapter(
      cruiseAdapter({
        async listEntries() {
          throw new Error("provider secret outage")
        },
      }),
    )
    const result = await closedProvider([
      ["healthy_secret", healthy],
      ["failing_secret", failing],
    ]).searchCruises({ context, scope, intent })

    expect(result.items).toHaveLength(1)
    expect(result.sources).toEqual([{ status: "ok" }, { status: "error" }])
    expect(JSON.stringify(result.sources)).not.toContain("secret")
  })

  it("rejects a cross-market/locale/currency scope before supplier discovery", async () => {
    const listEntries = vi.fn(cruiseAdapter().listEntries)
    const source = cruiseAdapterToSourceAdapter(cruiseAdapter({ listEntries }))
    const live = closedProvider([["admitted", source]])

    await expect(
      live.searchCruises({
        context,
        scope: { ...scope, locale: "en-GB", currency: "USD", marketId: "market_other" },
        intent,
      }),
    ).rejects.toThrow("active market scope")
    expect(listEntries).not.toHaveBeenCalled()
  })
})
