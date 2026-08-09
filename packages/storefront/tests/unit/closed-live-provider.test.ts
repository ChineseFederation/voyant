import type { FlightConnectorAdapter, FlightOffer } from "@voyant-travel/flights"
import { describe, expect, it, vi } from "vitest"

import { createClosedStorefrontShoppingLiveProvider } from "../../src/shopping/closed-live-provider.js"
import { createManagedStorefrontShoppingRuntime } from "../../src/shopping/managed-runtime.js"

const context = { storefrontId: "sf_1", channelId: "ch_1" }
const scope = {
  marketId: "market_ro",
  locale: "ro-RO",
  currency: "EUR",
  available: { marketIds: ["market_ro"], locales: ["ro-RO"], currencies: ["EUR"] },
}

function primitives() {
  return {
    env: vi.fn(() => ({ SERVER_SECRET: "credential_secret" })),
    database: { resolve: vi.fn(() => ({ id: "db" })) },
    storage: {},
    events: {},
    config: {},
  } as never
}

function markets(active = true) {
  return {
    listActiveMarkets: vi.fn(async () =>
      active
        ? [
            {
              id: "market_ro",
              defaultLocale: "ro-RO",
              defaultCurrency: "EUR",
              locales: ["ro-RO"],
              currencies: ["EUR"],
            },
          ]
        : [],
    ),
  }
}

function flightOffer(amount: string): FlightOffer {
  return {
    offerId: "shared_provider_offer",
    source: "provider_internal",
    itineraries: [
      {
        segments: [
          {
            segmentId: "segment_internal",
            carrierCode: "RO",
            flightNumber: "101",
            departure: { iataCode: "OTP", at: "2026-09-10T08:00:00+03:00" },
            arrival: { iataCode: "FCO", at: "2026-09-10T09:30:00+02:00" },
            cabin: "economy",
          },
        ],
      },
    ],
    fareBreakdowns: [],
    totalPrice: { amount, currency: amount === "100.00" ? "EUR" : "RON" },
    providerData: { locator: `secret_${amount}` },
  }
}

function flightAdapter(
  searchFlights: FlightConnectorAdapter["searchFlights"],
): FlightConnectorAdapter {
  return {
    capabilities: { provider: "provider_internal", declared: [] },
    searchFlights,
    async priceOffer() {
      throw new Error("not used")
    },
    async bookFlight() {
      throw new Error("not used")
    },
    async getOrder() {
      throw new Error("not used")
    },
    async cancelOrder() {
      throw new Error("not used")
    },
  }
}

describe("closed Storefront live provider", () => {
  it("fans out only admitted stay-capable adapters and the owned accommodations handler", async () => {
    const sourcedSearch = vi.fn(async () => ({
      status: "ok" as const,
      candidates: [
        {
          candidateRef: "stay_1",
          entity_module: "accommodations",
          entity_id: "hotel_1",
          selection: { roomTypeId: "room_1", ratePlanId: "rate_1" },
          price: { amount: "300.00", currency: "EUR" },
        },
      ],
    }))
    const ignoredSearch = vi.fn()
    const ownedSearch = vi.fn(async () => ({ candidates: [], status: "empty" as const }))
    const adapters = new Map([
      [
        "stay_connection",
        {
          capabilities: {
            verticals: ["accommodations"],
            supportsAvailabilitySearch: true,
          },
          searchAvailability: sourcedSearch,
        },
      ],
      [
        "cruise_connection",
        {
          capabilities: { verticals: ["cruises"], supportsAvailabilitySearch: true },
          searchAvailability: ignoredSearch,
        },
      ],
    ])
    const registry = {
      connections: () => [...adapters.keys()],
      resolveByConnection: (id: string) => adapters.get(id),
    }
    const catalogServices = {
      ensureSourceRegistry: vi.fn(async () => registry),
      getOwnedAvailabilitySearchHandlers: () => ({
        modules: () => ["accommodations"],
        resolve: () => ({ entityModule: "accommodations", searchAvailability: ownedSearch }),
      }),
    }
    const provider = createClosedStorefrontShoppingLiveProvider({
      primitives: primitives(),
      catalogServices: catalogServices as never,
      markets: markets(),
      loadStayPresentation: vi.fn(async () => ({
        title: "Hotel Public",
        roomName: "Public room",
      })),
    })

    const result = await provider.searchStays({
      context,
      scope,
      intent: {
        kind: "stay",
        destination: { city: "Rome" },
        checkIn: "2026-09-10",
        checkOut: "2026-09-15",
        rooms: [{ adults: 2 }],
      },
    })

    expect(sourcedSearch).toHaveBeenCalledOnce()
    expect(ownedSearch).toHaveBeenCalledOnce()
    expect(ignoredSearch).not.toHaveBeenCalled()
    expect(result.items).toEqual([
      expect.objectContaining({ title: "Hotel Public", roomName: "Public room" }),
    ])
    expect(JSON.stringify(result)).not.toContain("credential_secret")
  })

  it("rejects an inactive storefront/channel before resolving supply", async () => {
    const ensureSourceRegistry = vi.fn()
    const provider = createClosedStorefrontShoppingLiveProvider({
      primitives: primitives(),
      catalogServices: {
        ensureSourceRegistry,
        getOwnedAvailabilitySearchHandlers: vi.fn(),
      } as never,
      markets: markets(false),
    })
    await expect(
      provider.searchStays({
        context,
        scope,
        intent: {
          kind: "stay",
          destination: { city: "Rome" },
          checkIn: "2026-09-10",
          checkOut: "2026-09-15",
          rooms: [{ adults: 2 }],
        },
      }),
    ).rejects.toThrow("active market scope")
    expect(ensureSourceRegistry).not.toHaveBeenCalled()
  })

  it("fails flight search closed when the admitted runtime returns no sources", async () => {
    const listAdmittedShoppingSources = vi.fn(async () => [])
    const provider = createClosedStorefrontShoppingLiveProvider({
      primitives: primitives(),
      catalogServices: {} as never,
      markets: markets(),
      flights: { listAdmittedShoppingSources },
    })
    await expect(
      provider.searchFlights({
        context,
        scope,
        intent: {
          kind: "flight",
          slices: [{ origin: "OTP", destination: "FCO", departureDate: "2026-09-10" }],
          travelers: { adults: 2 },
        },
      }),
    ).resolves.toEqual({ items: [], sources: [{ status: "unavailable" }] })
    expect(listAdmittedShoppingSources).toHaveBeenCalledWith({
      storefrontId: "sf_1",
      channelId: "ch_1",
      marketId: "market_ro",
      locale: "ro-RO",
      currency: "EUR",
    })
  })

  it("keeps exact offer ownership opaque across partial multi-source flight search", async () => {
    const listAdmittedShoppingSources = vi.fn(async () => [
      {
        connectionId: "connection_eur",
        adapter: flightAdapter(async () => ({ offers: [flightOffer("100.00")] })),
      },
      {
        connectionId: "connection_ron",
        adapter: flightAdapter(async () => ({ offers: [flightOffer("450.00")] })),
      },
      {
        connectionId: "connection_failed",
        adapter: flightAdapter(async () => {
          throw new Error("supplier unavailable")
        }),
      },
    ])
    const live = createClosedStorefrontShoppingLiveProvider({
      primitives: primitives(),
      catalogServices: {} as never,
      markets: markets(),
      flights: { listAdmittedShoppingSources },
    })
    const issued: Array<Record<string, unknown>> = []
    let sequence = 0
    const runtime = createManagedStorefrontShoppingRuntime({
      markets: markets(),
      catalog: { searchSlice: async () => ({ items: [], total: 0 }) },
      live,
      references: {
        async issue(input) {
          issued.push(input as unknown as Record<string, unknown>)
          sequence += 1
          return {
            ref: `opaque-flight-offer-${String(sequence).padStart(4, "0")}`,
            expiresAt: "2026-08-08T10:15:00.000Z",
          }
        },
      },
      now: () => new Date("2026-08-08T10:00:00.000Z"),
      quoteFx: async () => ({
        rate: "0.2",
        provider: "server-fx",
        quotedAt: "2026-08-08T10:00:00.000Z",
      }),
    })

    const result = await runtime.search(context, {
      scope,
      intent: {
        kind: "flight",
        slices: [{ origin: "OTP", destination: "FCO", departureDate: "2026-09-10" }],
        travelers: { adults: 1 },
      },
    })

    expect(result.kind).toBe("flight")
    if (result.kind !== "flight") return
    expect(result.offers.map(({ price }) => price.presentation.amount)).toEqual(["90.00", "100.00"])
    expect(result.coverage).toEqual({ status: "partial", succeeded: 2, failed: 1, timedOut: 0 })
    expect(
      issued.map(
        (entry) =>
          (entry.payload as { selection: { connectionId: string } }).selection.connectionId,
      ),
    ).toEqual(["connection_ron", "connection_eur"])
    expect(JSON.stringify(result)).not.toContain("connection_")
    expect(JSON.stringify(result)).not.toContain("provider_internal")
    expect(JSON.stringify(result)).not.toContain("secret_")
  })
})
